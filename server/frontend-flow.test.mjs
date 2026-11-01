import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { authenticatedApi as handleApi } from './test-auth-fixture.mjs'
import { documentContext } from './attachments.mjs'

test('real stream handler preserves a split Markdown table and sends attachment text to the model (mock upstream)', async () => {
  const previousFetch = globalThis.fetch, previousKey = process.env.DASHSCOPE_API_KEY
  process.env.DASHSCOPE_API_KEY = 'TEST_ONLY_KEY'
  const calls = []
  const answer = '| 项目 | 甲 | 乙 |\n| --- | --- | --- |\n| 材料 | 附件甲 | 附件乙 |'
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body)
    if (String(url).endsWith('/chat/completions')) return Response.json({ choices: [{ message: { content: 'A' } }] })
    if (body.instructions?.includes('界面元数据整理器')) return Response.json({ output_text: JSON.stringify({ title: '附件比较', suggestions: [] }) })
    assert.match(JSON.stringify(body.input), /附件独有标识_123/)
    assert.match(body.instructions, /Markdown 表格/)
    const events = [
      { type: 'response.output_text.delta', delta: answer.slice(0, 30) },
      { type: 'response.output_text.delta', delta: answer.slice(30) },
      { type: 'response.completed', response: { output_text: answer } },
    ]
    return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  try {
    const body = { messages: [{ role: 'user', content: '请比较附件里的两种材料', attachments: [{ name: '比较.txt', text: '附件独有标识_123：材料甲与乙', size: 30 }] }] }
    const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST'; req.url = '/api/chat/stream'; req.headers = { host: '127.0.0.1' }
    let output = ''
    const res = { writeHead(code) { assert.equal(code, 200) }, write(chunk) { output += chunk }, end() {} }
    await handleApi(req, res)
    assert(!output.includes('event: error'), output)
    const done = output.split('\n\n').find(block => block.startsWith('event: done'))
    assert(done, output)
    const result = JSON.parse(done.split('\ndata: ')[1])
    assert.equal(result.answer, answer)
    assert.deepEqual(result.sources, [])
    assert(calls.length >= 3)
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = previousKey }
})

test('attachments are treated as bounded source material, not silently accepted when invalid', () => {
  assert.match(documentContext([{ name: 'a.md', text: '实际资料' }]), /实际资料/)
  assert.equal(documentContext([{ name: 'bad.txt', text: 'x'.repeat(16001) }]), '')
  assert.equal(documentContext([{ name: 'empty.txt', text: ' ' }]), '')
})

