import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { COMPANION_MODEL, COMPANION_PERSONA, COMPANION_MAX_TOKENS, handleCompanionChat } from './companion.mjs'

test('HTTP companion streams short replies, forwards only sanitized context, enforces device limit and masks failures', async () => {
  const calls = []
  let fail = false
  let chunks = ['我在整理书页。', '累了就歇一歇吧。']
  const upstream = createServer(async (req, res) => {
    let text = '';for await (const chunk of req) text += chunk
    calls.push(JSON.parse(text))
    if (fail) { res.writeHead(500);res.end('PRIVATE_UPSTREAM_DETAIL');return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const content of chunks) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  upstream.listen(0, '127.0.0.1');await once(upstream, 'listening')
  const local = createServer((req, res) => handleCompanionChat(req, res, {
    readJson: async req => { let text = '';for await (const chunk of req) text += chunk;return JSON.parse(text) },
    json: (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' });res.end(JSON.stringify(body)) },
    sendSse: (res, event, body) => res.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`),
    requireConfig: () => ({ apiKey: 'TEST_ONLY_KEY', baseUrl: `http://127.0.0.1:${upstream.address().port}` }),
    consumeSse: async (body, callback) => { const text = await new Response(body).text();for (const block of text.split('\n\n')) { const value = block.replace(/^data: /, '');if (value && value !== '[DONE]') callback(JSON.parse(value)) } },
  }))
  local.listen(0, '127.0.0.1');await once(local, 'listening')
  const url = `http://127.0.0.1:${local.address().port}`
  try {
    let requests = 0
    const send = async (message, cookie = '', history = []) => {
      requests++
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ messages: [...history, { role: 'user', content: message }], context: { view: 'research', topic: '衣裳', body: 'MAIN_BODY_PRIVATE' } }) })
      return { text: await response.text(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
    }
    const first = await send('你好')
    assert(first.text.includes('event: delta'));assert(first.text.includes('我在整理书页。'));assert(!first.text.includes('TEST_ONLY_KEY'))
    assert.equal(calls[0].model, COMPANION_MODEL);assert.equal(calls[0].max_tokens, COMPANION_MAX_TOKENS);assert.equal(calls[0].temperature, .8);assert.equal(calls[0].enable_thinking, false)
    assert(calls[0].messages[0].content.startsWith(COMPANION_PERSONA))
    assert(!JSON.stringify(calls[0]).includes('MAIN_BODY_PRIVATE'));assert(!('tools' in calls[0]));assert(!('enable_search' in calls[0]))
    const referral = await send('宋代褙子是什么结构', first.cookie);assert(referral.text.includes('referral'));assert.equal(calls.length, 1)
    const era = await send('你知道元朝？', first.cookie)
    assert(era.text.includes('不认得') && era.text.includes('referral'));assert.equal(calls.length, 1)
    const oldEra = [{ role: 'user', content: '你知道元朝？' }, { role: 'assistant', content: '当然知道，元朝是忽必烈建立的。' }]
    const followup = await send('那是谁建立的？', first.cookie, oldEra)
    assert(followup.text.includes('不认得'));assert(!followup.text.includes('忽必烈'));assert.equal(calls.length, 1)
    chunks = ['恋人两个字，我听见了。']
    const romance = await send('你愿意做我女朋友吗', first.cookie)
    assert(romance.text.includes('恋人两个字，我听见了。'));assert.equal(calls.length, 2)
    chunks = ['字'.repeat(95), '字'.repeat(30) + '。']
    const long = await send('多说两句吧', first.cookie)
    const payloads = text => text.split('\n\n').filter(block => block.startsWith('event: done')).map(block => JSON.parse(block.split('\ndata: ')[1]))
    assert.equal(payloads(long.text)[0].answer.length, 100)
    chunks = ['[[SI', 'LENT]]']
    const silent = await send('嗯', first.cookie)
    assert(!silent.text.includes('event: delta'));assert(!silent.text.includes('[[SILENT]]'))
    assert.deepEqual(payloads(silent.text)[0], { answer: '', silent: true })
    chunks = ['[[CRI', 'SIS]]']
    const beforeCrisis = calls.length
    const crisis = await send('我穿着襦裙，现在想伤害自己', first.cookie)
    assert.equal(calls.length, beforeCrisis + 1, 'a clothing keyword must not override the crisis rule')
    assert(!crisis.text.includes('event: delta'));assert(!crisis.text.includes('[[CRISIS]]'))
    assert.equal(payloads(crisis.text)[0].crisis, true)
    const futureCrisis = await send('想到元朝的话题，我想伤害自己', first.cookie)
    assert.equal(payloads(futureCrisis.text)[0].crisis, true, 'crisis must take priority over era referral')
    chunks = ['当然知道。', '元朝是忽必烈建立的。']
    const leaked = await send('讲讲你在书铺的见闻', first.cookie)
    assert(leaked.text.includes('不认得') && leaked.text.includes('referral'))
    assert(!leaked.text.includes('当然知道') && !leaked.text.includes('忽必烈'), 'no rejected sentence may reach SSE deltas')
    chunks = ['我在晒书。']
    const casual = await send('你在做什么？', first.cookie, oldEra)
    assert(casual.text.includes('我在晒书。'))
    assert(!calls.at(-1).messages.some(m => m.role === 'assistant' && m.content.includes('元朝')), 'old incorrect replies must not be fed back')
    fail = true
    const failed = await send('今天有点累', first.cookie);assert(failed.text.includes('我卡住了'));assert(!failed.text.includes('PRIVATE_UPSTREAM_DETAIL'))
    const paidCalls = calls.length
    while (requests < 40) await send('深衣有什么出处', first.cookie)
    const limited = await send('你好', first.cookie);assert(limited.text.includes('今天聊太多了'));assert.equal(calls.length, paidCalls)
  } finally { local.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r => local.close(r)), new Promise(r => upstream.close(r))]) }
})
