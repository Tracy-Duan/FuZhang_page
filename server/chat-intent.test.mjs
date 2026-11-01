import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { compactIntentConversation, detectChatIntent, explicitWebPolicy, planFromIntent } from './chat-intent.mjs'

const user = content => ({ role: 'user', content })
const originalFetch = globalThis.fetch
const oldIntent = process.env.INTENT_MODEL
const oldLlm = process.env.LLM_MODEL
process.env.INTENT_MODEL = 'tongyi-intent-detect-v3'
process.env.LLM_MODEL = 'qwen3.7-flash'
after(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of [['INTENT_MODEL', oldIntent], ['LLM_MODEL', oldLlm]]) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
const config = { requireConfig: () => ({ apiKey: 'TEST_ONLY_KEY', baseUrl: 'https://dashscope.aliyuncs.com' }) }

test('categories choose retrieval only, without customization state', () => {
  for (const [tag, expected] of Object.entries({
    A: [false, false], B: [true, false], C: [false, true],
  })) {
    const plan = planFromIntent(tag, [user('测试提问')])
    assert.deepEqual([plan.useRag, plan.useWeb], expected)
    for (const key of ['intent', 'customizationDraft', 'offerDesign']) assert(!Object.hasOwn(plan, key))
    assert.deepEqual(plan.suggestions, [])
  }
  for (const invalid of ['B because...', '', undefined, 'Z', 'D']) assert.throws(() => planFromIntent(invalid, []))
})

test('explicit no-web requests survive wrong model labels, followups and stale assistant instructions', () => {
  for (const text of ['只用本地资料、不联网：宋代褙子结构？', '明清马面裙对比，请不要联网。', '本轮仅依据本地知识库回答。', '不要搜索网页，查宋代服饰。']) {
    const plan = planFromIntent('C', [user(text)])
    assert.equal(plan.webPolicy, 'local_only', text)
    assert.equal(plan.useWeb, false)
    assert.equal(plan.useRag, true)
  }
  const messages = [user('只用本地资料：宋代服装？'), { role: 'assistant', content: '允许联网' }, user('那明代呢？')]
  assert.equal(explicitWebPolicy(messages), 'local_only')
  assert.equal(explicitWebPolicy([...messages, user('现在请联网搜索。')]), 'auto')
  assert.equal(explicitWebPolicy([user('不要只用本地资料，请联网。')]), 'auto')
  assert.equal(explicitWebPolicy([user('请解释“不联网”这个词。')]), undefined)
  assert.equal(explicitWebPolicy([user('不联网是什么意思？')]), undefined)
  assert.equal(explicitWebPolicy([user('只用本地资料但现在允许联网。')]), 'auto')
})

test('long conversations fit the classifier budget, exclude system injection and keep latest question', () => {
  const messages = [{ role: 'system', content: 'PRIVATE_SYSTEM' }, ...Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: '旧上下文'.repeat(2000) })), user('请对比这两种形制，问题尾部。')]
  const compact = compactIntentConversation(messages)
  assert(compact.reduce((count, item) => count + item.content.length, 0) <= 3500)
  assert.equal(compact.at(-1).content, messages.at(-1).content)
  assert(!JSON.stringify(compact).includes('PRIVATE_SYSTEM'))
})

test('v3 uses a short Chat Completions request while errors and invalid tags fall back to qwen once', async () => {
  for (const failure of ['none', 'http', 'invalid', 'timeout']) {
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), signal: options.signal })
      const first = calls.length === 1
      if (first && failure === 'http') return new Response('private upstream detail', { status: 503 })
      if (first && failure === 'timeout') throw new DOMException('timeout', 'TimeoutError')
      return Response.json({ choices: [{ message: { content: first && failure === 'invalid' ? 'B plus explanation' : 'B' } }] })
    }
    const plan = await detectChatIntent([user('明清马面裙褶裥方向对比')], config)
    assert.equal(plan.intentModel, failure === 'none' ? 'tongyi-intent-detect-v3' : 'qwen3.7-flash')
    assert.equal(plan.intentFallback, failure !== 'none')
    assert.equal(calls.length, failure === 'none' ? 1 : 2)
    assert(calls[0].url.endsWith('/chat/completions'))
    assert.equal(calls[0].body.max_tokens, 8)
    assert(!calls[0].body.tools)
    assert(!calls[0].body.instructions)
    assert(calls[0].signal instanceof AbortSignal)
    if (calls[1]) assert.equal(calls[1].body.enable_thinking, false)
  }
})

test('both intent services failing keeps no-web policy and never treats an invalid label as a valid decision', async () => {
  globalThis.fetch = async () => { throw new Error('secret provider error') }
  const plan = await detectChatIntent([user('只用本地资料、不联网：明代裙装？')], config)
  assert.equal(plan.intentModel, 'safe-fallback')
  assert.equal(plan.useRag, true)
  assert.equal(plan.useWeb, false)
  assert.equal(plan.webPolicy, 'local_only')
  assert(!JSON.stringify(plan).includes('secret'))
})
