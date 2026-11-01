import test from 'node:test'
import assert from 'node:assert/strict'
import { testAuthorization } from './test-auth-fixture.mjs'
const { validateProductionEnvironment, startProductionServer } = await import('./start.mjs')

test('production startup rejects missing credentials and public API binding', async () => {
  assert.throws(() => validateProductionEnvironment({}), /DASHSCOPE_API_KEY/)
  assert.throws(() => validateProductionEnvironment({ DASHSCOPE_API_KEY: 'test-only' }), /AUTH_SECRET/)
  validateProductionEnvironment({ DASHSCOPE_API_KEY: 'test-only', AUTH_SECRET: 'x'.repeat(64) })
  const previous = process.env.DASHSCOPE_API_KEY
  process.env.DASHSCOPE_API_KEY = 'test-only-no-upstream'
  try {
    await assert.rejects(startProductionServer({ host: '0.0.0.0', port: 0 }), /只监听本机/)
  } finally {
    if (previous === undefined) delete process.env.DASHSCOPE_API_KEY
    else process.env.DASHSCOPE_API_KEY = previous
  }
})

test('production API keeps private files unavailable and library access authenticated', async () => {
  const previous = process.env.DASHSCOPE_API_KEY
  process.env.DASHSCOPE_API_KEY = 'test-only-no-upstream'
  const server = await startProductionServer({ port: 0, host: '127.0.0.1' })
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    for (const path of ['/', '/.env.local', '/server/rag-data/users.json', '/@fs/E:/private']) {
      const response = await fetch(base + path)
      assert.equal(response.status, 404, path)
      assert.deepEqual(await response.json(), { error: '接口不存在' })
    }
    assert.equal((await fetch(base + '/api/knowledge?category=forms')).status, 401)
    const response = await fetch(base + '/api/knowledge?category=forms', { headers: { Authorization: testAuthorization } })
    assert.equal(response.status, 200)
    assert((await response.json()).items.length > 0)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    if (previous === undefined) delete process.env.DASHSCOPE_API_KEY
    else process.env.DASHSCOPE_API_KEY = previous
  }
})
