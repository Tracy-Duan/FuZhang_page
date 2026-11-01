// Verify the assembled package outside the checkout, with runtime dependencies only.
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'
const run = promisify(execFile)
const source = resolve(process.argv[2] || '')
assert(process.argv[2], 'Pass a release directory')
const temporary = await mkdtemp(join(tmpdir(), 'fuzhang-release-check-'))
let child
try {
  await cp(source, temporary, { recursive: true })
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  await run(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: temporary })
  await run(process.execPath, ['deploy/init-env.mjs'], { cwd: temporary })
  const initial = await readFile(join(temporary, '.env.local'), 'utf8')
  assert.match(initial, /^AUTH_SECRET=[a-f0-9]{64}$/m)
  await assert.rejects(run(process.execPath, ['deploy/init-env.mjs'], { cwd: temporary }))
  assert.equal(await readFile(join(temporary, '.env.local'), 'utf8'), initial)
  const env = { ...process.env, INVITE_CODES: 'TESTAB', DASHSCOPE_API_KEY: 'test-only-no-model-calls', AUTH_USERS_FILE: join(temporary, 'test-users.json'), HANFU_RAG_DATA_DIR: '', HOST: '127.0.0.1', PORT: '0' }
  child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'server/start.mjs'], { cwd: temporary, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const base = await new Promise((resolveBase, reject) => {
    let logs = ''
    const timer = setTimeout(() => reject(new Error('Production startup timed out')), 15000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Production process exited: ${code}`)) })
    child.stdout.on('data', chunk => {
      logs += chunk.toString()
      const match = logs.match(/127\.0\.0\.1:(\d+)/)
      if (match) { clearTimeout(timer); resolveBase(`http://127.0.0.1:${match[1]}`) }
    })
    child.stderr.on('data', () => {})
  })
  for (const path of ['/', '/.env.local', '/server/rag-data/users.json']) assert.equal((await fetch(base + path)).status, 404)
  assert.equal((await fetch(base + '/api/knowledge?category=forms')).status, 401)
  const registration = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'release_fixture', password: 'test-only-password', inviteCode: 'TESTAB' }) })
  assert.equal(registration.status, 200)
  const { session } = await registration.json()
  const headers = { Authorization: `Bearer ${session.token}` }
  const categories = {}
  for (const category of ['forms', 'stories', 'research']) {
    const response = await fetch(`${base}/api/knowledge?category=${category}`, { headers })
    assert.equal(response.status, 503)
    const body = await response.json()
    assert(body.error)
    categories[category] = 'private corpus not configured'
  }
  const health = await fetch(base + '/api/health', { headers })
  assert.equal(health.status, 200)
  const status = await health.json()
  assert.equal(status.rag.available, false)
  console.log(JSON.stringify({ node: process.version, runtimeOnlyInstall: true, startup: true, privateFilesDenied: true, guestDenied: true, envInitializationPreserved: true, categories, health: status.rag || status.knowledge || 'responded', modelCalls: 0 }, null, 2))
} finally {
  if (child && child.exitCode === null) await new Promise(resolveStop => { child.once('exit', resolveStop); child.kill('SIGTERM') })
  // Only the mkdtemp-created test directory is removed; the original release stays untouched.
  await rm(temporary, { recursive: true, force: true })
}
