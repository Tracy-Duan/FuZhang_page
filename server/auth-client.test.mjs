import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'

const directory = await mkdtemp(path.join(tmpdir(), 'fuzhang-auth-integration-'))
const filename = path.join(directory, 'users.json')
process.env.INVITE_CODES = 'TESTAB'
process.env.AUTH_USERS_FILE = filename
let auth = await import('./auth.mjs?initial')
const source = await readFile(new URL('../src/components/auth/authClient.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const client = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
const calls = []
const server = createServer(async (req, res) => {
  calls.push(req.url)
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' });res.end(JSON.stringify(value)) }
  try {
    await auth.handleAuthApi(req, res, { json, readJson: async req => { let text = '';for await (const chunk of req) text += chunk;return JSON.parse(text) } })
  } catch { json(res, 500, { error: 'fixture_error' }) }
})
server.listen(0, '127.0.0.1');await once(server, 'listening')
const originalFetch = globalThis.fetch
const realFetch = (url, init) => originalFetch(new URL(url, `http://127.0.0.1:${server.address().port}`), init)
globalThis.fetch = realFetch
after(async () => { globalThis.fetch = originalFetch;await new Promise(resolve => server.close(resolve));await rm(filename, { force: true });await rmdir(directory) })
function storage(accounts) {
  let value = JSON.stringify(accounts)
  return { getItem: () => value, setItem: (_key, next) => { value = next } }
}
function legacy(username, password, inviteCode = 'TESTAB') {
  return { passwordHash: password, user: { username, nickname: '旧用户', inviteCodeUsed: inviteCode } }
}

test('real HTTP migration verifies a legacy password, persists server account, then logs in without local fallback', async () => {
  const local = storage({ legacy_reader: legacy('legacy_reader', 'correct-legacy-password'), untouched: legacy('untouched', 'other-password') })
  const session = await client.loginWithLegacyAccount({ username: 'legacy_reader', password: 'correct-legacy-password' }, local)
  assert.equal(auth.verifyToken(session.token).username, 'legacy_reader')
  assert(!JSON.parse(local.getItem()).legacy_reader);assert(JSON.parse(local.getItem()).untouched)
  const persisted = JSON.parse(await readFile(filename, 'utf8'))
  assert(!JSON.stringify(persisted).includes('correct-legacy-password'))
  // A fresh module must recover the account from disk, rather than its previous memory cache.
  auth = await import('./auth.mjs?reloaded')
  const again = await client.loginWithLegacyAccount({ username: 'legacy_reader', password: 'correct-legacy-password' }, storage({}))
  assert.equal(again.user.username, 'legacy_reader')
})

test('wrong password and malformed local records do not trigger registration or grant a session', async () => {
  const before = calls.filter(url => url.endsWith('/register')).length
  const local = storage({ wrong_reader: legacy('wrong_reader', 'actual-password') })
  await assert.rejects(client.loginWithLegacyAccount({ username: 'wrong_reader', password: 'wrong-password' }, local), /用户名或密码错误/)
  assert(JSON.parse(local.getItem()).wrong_reader)
  await assert.rejects(client.loginWithLegacyAccount({ username: 'bad_reader', password: 'test-password' }, storage({ bad_reader: { passwordHash: 'test-password', user: { username: 5 } } })), /用户名或密码错误/)
  assert.equal(calls.filter(url => url.endsWith('/register')).length, before)
})

test('legacy migration cannot replace an existing server password or discard a rejected legacy account', async () => {
  await client.requestAuth('register', { username: 'collision_reader', password: 'server-password', inviteCode: 'TESTAB' })
  const local = storage({ collision_reader: legacy('collision_reader', 'legacy-password') })
  await assert.rejects(client.loginWithLegacyAccount({ username: 'collision_reader', password: 'legacy-password' }, local), /用户名已被占用/)
  assert(JSON.parse(local.getItem()).collision_reader)
  assert.equal((await client.requestAuth('login', { username: 'collision_reader', password: 'server-password' })).user.username, 'collision_reader')
})

test('unavailable backend and malformed success never create local sessions or alter old accounts', async () => {
  const local = storage({ offline_reader: legacy('offline_reader', 'test-password') })
  const before = local.getItem()
  try {
    globalThis.fetch = async () => new Response('{}', { status: 404 })
    await assert.rejects(client.loginWithLegacyAccount({ username: 'offline_reader', password: 'test-password' }, local), /登录服务尚未就绪/)
    globalThis.fetch = async () => { throw new TypeError('fetch failed') }
    await assert.rejects(client.loginWithLegacyAccount({ username: 'offline_reader', password: 'test-password' }, local), /连接不上登录服务/)
    globalThis.fetch = async () => new Response('{}', { status: 200 })
    await assert.rejects(client.requestAuth('register', { username: 'new_reader', password: 'test-password', inviteCode: 'TESTAB' }), /有效会话/)
    assert.equal(local.getItem(), before)
  } finally { globalThis.fetch = realFetch }
})

test('the shared invite remains reusable for concurrent and later registrations after restart', async () => {
  await Promise.all(['parallel_one', 'parallel_two'].map(username => client.requestAuth('register', { username, password: 'test-password', inviteCode: 'TESTAB' })))
  const stored = JSON.parse(await readFile(filename, 'utf8'))
  assert(stored.parallel_one);assert(stored.parallel_two);assert(stored.legacy_reader)
  assert.equal(stored.parallel_one.inviteCodeUsed, 'TESTAB')
  assert.equal(stored.parallel_two.inviteCodeUsed, 'TESTAB')
  auth = await import('./auth.mjs?shared-code-restart')
  const next = await client.requestAuth('register', { username: 'after_restart', password: 'test-password', inviteCode: 'testab' })
  assert.equal(next.user.inviteCodeUsed, 'TESTAB')
})
