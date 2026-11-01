import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { authenticatedApi as handleApi } from './test-auth-fixture.mjs'
import { retrieveHanfuEvidence } from './rag.mjs'

// Exercise the real HTTP handlers and a synthetic corpus. The paid upstream is also a fixture.
const originalFetch = globalThis.fetch
const oldKey = process.env.DASHSCOPE_API_KEY
const oldIntent = process.env.INTENT_MODEL
const oldLlm = process.env.LLM_MODEL
process.env.DASHSCOPE_API_KEY = 'TEST_ONLY_KEY'
process.env.INTENT_MODEL = 'tongyi-intent-detect-v3'
process.env.LLM_MODEL = 'qwen3.7-flash'
const query = '样例服饰'
const source = { type: 'url', title: '馆藏裙装研究资料', url: 'https://www.dpm.org.cn/collection/fixture.html' }
const calls = []
let plan, assessment, noSearchResults, metadataFail, metadataGate, intentFail, tagOverride, unlinkedAnswer, manySources
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://dashscope.aliyuncs.com/')) return originalFetch(url, options)
  const body = JSON.parse(options.body)
  calls.push(body)
  if (String(url).endsWith('/chat/completions')) {
    assert.equal(body.max_tokens, 8)
    assert(!body.tools)
    if (intentFail && body.model === 'tongyi-intent-detect-v3') return new Response('private intent failure', { status: 503 })
    const tag = tagOverride || (plan.useWeb ? 'C' : plan.useRag ? 'B' : 'A')
    return Response.json({ choices: [{ message: { content: tag } }] })
  }
  assert.equal(body.model, 'qwen3.7-flash')
  assert.doesNotMatch(body.instructions, /customizationDraft|offerDesign|customize|"intent"/)
  if (body.instructions.includes('界面元数据整理器')) {
    if (metadataFail) return new Response('private metadata failure', { status: 503 })
    if (metadataGate) await metadataGate
    // A stale or noncompliant upstream response must not revive removed fields.
    return Response.json({ output_text: JSON.stringify({ intent: 'customize', title: '明清马面裙', suggestions: ['哪些文物可以对比？'], customizationDraft: { season: '夏天', colors: '灰绿色' }, offerDesign: true }) })
  }
  if (body.instructions.includes('证据充分性审查员')) {
    assert.equal(body.max_output_tokens, 180)
    assert(!body.tools)
    assert.match(JSON.parse(body.input).evidence, /Synthetic marker/)
    return Response.json({ output_text: JSON.stringify(assessment) })
  }
  const searching = body.tools?.some(tool => tool.type === 'web_search')
  if (searching) {
    assert.equal(body.tool_choice, 'required')
    assert.match(JSON.stringify(body.input), /web_search/)
  } else assert(!body.tool_choice)
  const candidates = manySources ? [...Array.from({length: 13}, (_, i) => ({ type: 'url', url: `https://www.dpm.org.cn/collection/unused-${i}.html` })), source] : [source]
  const item = { type: 'web_search_call', id: 'search_fixture', status: 'completed', action: { query, sources: noSearchResults ? [] : candidates } }
  const answer = unlinkedAnswer === 'none' ? '已经生成完整回答，但没有正文角标。' : unlinkedAnswer === 'url' ? '结论[来源](https://www.sohu.com/untrusted)。' : unlinkedAnswer ? '结论[ref_1]。' : `已核对${body.instructions.includes('Synthetic marker') ? '本地资料[local_1]' : ''}${searching ? `网页资料[来源](${source.url})` : ''}；仍缺少的细节会说明证据边界。`
  if (!body.stream) return Response.json({ output_text: JSON.stringify({ answer, intent: 'customize', customizationDraft: { colors: '灰绿色' }, offerDesign: true }), output: searching ? [item] : [] })
  const events = [
    ...(searching ? [{ type: 'response.output_item.added', item: { ...item, status: 'in_progress' } }, { type: 'response.output_item.done', item }] : []),
    { type: 'response.output_text.delta', delta: answer },
    { type: 'response.completed', response: { output_text: answer } },
  ]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
}
const server = createServer((req, res) => handleApi(req, res).catch(error => {
  res.writeHead(500, { 'Content-Type': 'application/json' });res.end(JSON.stringify({ error: error.message }))
}))
server.listen(0, '127.0.0.1');await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
after(async () => {
  globalThis.fetch = originalFetch
  if (oldKey === undefined) delete process.env.DASHSCOPE_API_KEY
  else process.env.DASHSCOPE_API_KEY = oldKey
  for (const [key, value] of [['INTENT_MODEL', oldIntent], ['LLM_MODEL', oldLlm]]) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  server.closeAllConnections();await new Promise(resolve => server.close(resolve))
})
function reset(options = {}) {
  calls.length = 0
  plan = { useRag: true, useWeb: false, title: '明清马面裙', ...options }
  assessment = { sufficient: false, reason: '只有明代概述，没有清代和褶裥方向证据。' }
  noSearchResults = false
  metadataFail = false;metadataGate = null;intentFail = false;tagOverride = null
  unlinkedAnswer = false;manySources = false
}
async function send(stream = true, message = query, extra = {}) {
  const response = await fetch(`${base}/api/chat${stream ? '/stream' : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stream ? { messages: [{ role: 'user', content: message }], ...extra } : { message, ...extra }),
  })
  return { response, text: await response.text() }
}

test('web disabled reviews real local hits, retains local evidence and never searches when evidence is insufficient', async () => {
  reset()
  assert.equal((await retrieveHanfuEvidence(query)).used, true)
  const { text } = await send()
  assert.match(text, /正在核对本地证据/)
  assert.match(text, /仅使用本地资料/)
  assert.match(text, /"route":"rag"/)
  assert.match(text, /event: done/)
  assert(!text.includes('event: error'))
  assert.match(text, /本地资料 2 条 · 未调用联网工具/)
  assert.equal(calls.length, 4)
  assert.equal(calls[0].model, 'tongyi-intent-detect-v3')
  assert(!calls.some(body => body.tools))
  assert.match(calls.at(-1).instructions, /联网搜索未开启/)
})

test('nonstream API returns RAG and web retrieval records independently of citation selection', async () => {
  reset()
  const { response, text } = await send(false, query, { forceSearch: true })
  assert.equal(response.status, 200)
  assert.equal(calls.at(-1).tool_choice, 'required')
  const result = JSON.parse(text)
  assert.equal(result.sources.length, 2)
  assert.equal(result.sources[0].origin, 'local')
  assert.equal(result.sources[1].url, source.url)
  assert(result.answer.includes(`[1](${result.sources[0].url})`))
  assert(result.answer.includes(`[2](${source.url})`))
})

test('all fourteen web candidates survive in both HTTP APIs even when only the last is cited', async () => {
  for (const stream of [true, false]) {
    reset();manySources = true
    const {text} = await send(stream, query, { forceSearch: true })
    const result = stream ? JSON.parse(/event: done\ndata: (.*)/.exec(text)[1]) : JSON.parse(text)
    assert.equal(result.sources.filter(item => item.origin === 'web').length, 14)
    assert(result.sources.some(item => item.url === source.url))
    assert.equal(result.sources.filter(item => item.url.includes('unused-')).length, 13)
  }
})

test('missing or unmatched inline citations are notices, never errors that discard retrieved sources', async () => {
  for (const [stream, mode] of [[true, true], [false, true], [true, 'url'], [false, 'url'], [true, 'none'], [false, 'none']]) {
    reset();unlinkedAnswer = mode
    const {response, text} = await send(stream, query, { forceSearch: true })
    assert.equal(response.status, 200)
    assert(!text.includes('event: error'))
    const result = stream ? JSON.parse(/event: done\ndata: (.*)/.exec(text)[1]) : JSON.parse(text)
    assert.equal(result.sources.length, 2)
    assert(result.sources.some(item => item.origin === 'local'))
    assert(result.sources.some(item => item.url === source.url))
    assert.match(result.citationWarning, /未能匹配|未标注/)
    if (mode === 'none') assert.equal(result.answer, '已经生成完整回答，但没有正文角标。')
    if (mode === 'url') assert(!result.answer.includes('sohu.com'))
  }
})

test('pure local and pure web uncited answers retain their respective retrieval records', async () => {
  for (const stream of [true, false]) for (const local of [true, false]) {
    reset({ useRag: local, useWeb: !local });assessment = { sufficient: true };unlinkedAnswer = 'none'
    const { text } = await send(stream, query, { forceSearch: !local })
    assert(!text.includes('event: error'))
    const result = stream ? JSON.parse(/event: done\ndata: (.*)/.exec(text)[1]) : JSON.parse(text)
    assert(result.sources.length > 0)
    assert(result.sources.every(item => item.origin === (local ? 'local' : 'web')))
    assert.match(result.citationWarning, /未标注/)
  }
})

test('web disabled keeps empty RAG, sufficient RAG and greetings away from online tools', async () => {
  reset()
  const empty = await send(true, '你好') // Force the planner's local branch to exercise a genuine empty corpus result.
  assert.match(empty.text, /"route":"direct"/)
  assert(!calls.some(body => body.tools))
  assert.equal(calls.length, 3)
  reset();assessment = { sufficient: true, reason: '核心要求已有明确证据。' }
  const local = await send()
  assert.match(local.text, /"route":"rag"/)
  assert(!calls.at(-1).tools)
  reset({ useRag: false })
  const greeting = await send(true, '你好')
  assert.match(greeting.text, /"route":"direct"/)
  assert.equal(calls.length, 3)
})

test('force-search works in both APIs and bypasses local review even if model policy says local-only', async () => {
  for (const stream of [true, false]) {
    reset({ webPolicy: 'local_only' })
    await send(stream, `只用本地资料、不联网：${query}`, { forceSearch: true })
    assert.equal(calls.length, stream ? 3 : 2)
    assert.equal(calls.at(-1).tool_choice, 'required')
  }
})

test('wrong classifier label cannot override explicit no-web request, and v3 failures use the qwen fallback', async () => {
  reset({ useWeb: true }) // Model says C, but the user has explicitly forbidden web access.
  const local = await send(true, '只用本地资料、不联网：样例服饰')
  assert.match(local.text, /"route":"rag"/)
  assert(!calls.some(body => body.tools))
  reset({ useRag: false });intentFail = true
  const fallback = await send(true, '你好')
  assert.match(fallback.text, /event: done/)
  assert.match(fallback.text, /已使用备用判断/)
  assert.equal(calls[0].model, 'tongyi-intent-detect-v3')
  assert.equal(calls[1].model, 'qwen3.7-flash')
})

test('title and suggestions run alongside the answer without restoring customization fields', async () => {
  reset({ useRag: false })
  let release
  metadataGate = new Promise(resolve => { release = resolve })
  const response = await fetch(`${base}/api/chat/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ messages: [{ role: 'user', content: '我想做一套灰绿色夏日通勤汉服。' }] }),
  })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (!text.includes('event: delta')) {
      const chunk = await reader.read()
      assert(!chunk.done, 'answer must start before metadata resolves')
      text += decoder.decode(chunk.value, { stream: true })
    }
    assert(!text.includes('event: done'))
  } finally { release() }
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    text += decoder.decode(chunk.value, { stream: true })
  }
  const result = JSON.parse(/event: done\ndata: (.*)/.exec(text)[1])
  for (const key of ['intent', 'customizationDraft', 'offerDesign']) assert(!Object.hasOwn(result, key))
  assert.equal(result.title, '明清马面裙')
  assert.deepEqual(result.suggestions, ['哪些文物可以对比？'])
})

test('metadata failure retains a useful title and does not break the main answer', async () => {
  reset({ useRag: false });metadataFail = true
  const { text } = await send(true, '你好服章')
  assert.match(text, /event: done/)
  assert.match(text, /"title":"你好服章"/)
  assert(!text.includes('private metadata'))
})

test('historically grounded styling remains knowledge retrieval without a design workflow', async () => {
  reset();tagOverride = 'B';assessment = { sufficient: true }
  const { text } = await send(true, '根据样例服饰史料，为我设计通勤搭配。')
  assert.match(text, /"route":"rag"/)
  const result = JSON.parse(/event: done\ndata: (.*)/.exec(text)[1])
  for (const key of ['intent', 'customizationDraft', 'offerDesign']) assert(!Object.hasOwn(result, key))
  assert(!calls.some(body => body.tools))
})

test('both answer APIs drop legacy customization output even when the user discusses design', async () => {
  for (const stream of [true, false]) {
    reset({ useRag: false })
    const { text, response } = await send(stream, '设计一套通勤汉服，不要求复原。')
    assert.equal(response.status, 200)
    const result = stream ? JSON.parse(/event: done\ndata: (.*)/.exec(text)[1]) : JSON.parse(text)
    assert(result.answer)
    for (const key of ['intent', 'customizationDraft', 'offerDesign']) assert(!Object.hasOwn(result, key))
  }
})

test('explicit local-only request stays local, and empty web results do not count as a successful search', async () => {
  reset({ webPolicy: 'local_only' })
  const local = await send(true, `只用本地资料、不联网：${query}`)
  assert.match(local.text, /"route":"rag"/)
  assert.match(local.text, /仅使用本地资料/)
  for (const stream of [true, false]) {
    reset();noSearchResults = true
    const empty = await send(stream, query, { forceSearch: true })
    assert.match(empty.text, /联网检索没有返回可追溯网址/)
    assert(!empty.text.includes('event: done'))
    if (!stream) assert.equal(empty.response.status, 500)
  }
})

test('both HTTP APIs default to web disabled even for external intent or explicit requests to search', async () => {
  for (const stream of [true, false]) for (const flag of [undefined, false]) {
    reset({ useRag: false, useWeb: true })
    const { text } = await send(stream, '请联网搜索今天最新的汉服展览', flag === undefined ? {} : { forceSearch: flag })
    assert(!text.includes('event: error'))
    assert(!calls.some(body => body.tools?.some(tool => tool.type === 'web_search')))
    assert.match(calls.at(-1).instructions, /未开启联网搜索|联网搜索未开启/)
    assert(text.includes(stream ? 'event: done' : '"answer"'))
    const enabled = await send(stream, query, { forceSearch: true })
    assert(!enabled.text.includes('event: error'))
    assert.equal(calls.at(-1).tools[0].type, 'web_search')
    calls.length = 0
    await send(stream, query, { forceSearch: false })
    assert(!calls.some(body => body.tools))
  }
})
