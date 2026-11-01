import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const testDirectory = await mkdtemp(path.join(tmpdir(), 'fuzhang-auth-unit-'))
const testFile = path.join(testDirectory, 'users.json')
process.env.INVITE_CODES = 'TESTAB'
process.env.AUTH_USERS_FILE = testFile
const { registerUser, loginUser, verifyToken, handleAuthApi, VALID_INVITE_CODES } = await import('./auth.mjs')
after(async () => { await rm(testFile, { force: true });await rmdir(testDirectory) })

test('only explicitly configured invite codes are accepted', () => {
  assert.deepEqual([...VALID_INVITE_CODES], ['TESTAB'])
  assert.equal(VALID_INVITE_CODES.has('FUZHANG2026'), false)
  assert.equal(VALID_INVITE_CODES.has('HANFU2026'), false)
  assert.equal(VALID_INVITE_CODES.has('INVALID_CODE_123'), false)
})

test('registration rejects invalid invite code', async () => {
  await assert.rejects(
    () => registerUser({
      username: 'test_invite_fail',
      password: 'password123',
      inviteCode: 'WRONG_CODE',
    }),
    /邀请码无效/
  )
})

test('registration rejects short username and password', async () => {
  await assert.rejects(
    () => registerUser({
      username: 'a',
      password: 'password123',
      inviteCode: 'TESTAB',
    }),
    /用户名需在 2 到 20 个字符之间/
  )

  await assert.rejects(
    () => registerUser({
      username: 'valid_user',
      password: '123',
      inviteCode: 'TESTAB',
    }),
    /密码不能少于 6 位/
  )
})

test('registration with valid invite code succeeds and token can be verified', async () => {
  const testUser = `tester_${Date.now()}`
  const result = await registerUser({
    username: testUser,
    password: 'securePassword123',
    inviteCode: 'TESTAB',
    nickname: '考据学人',
  })

  assert.equal(result.success, true)
  assert.ok(result.session.token)
  assert.equal(result.session.user.username, testUser)
  assert.equal(result.session.user.nickname, '考据学人')
  assert.equal(result.session.user.role, 'tester')

  // Verify token
  const payload = verifyToken(result.session.token)
  assert.ok(payload)
  assert.equal(payload.username, testUser)

  // Tampered token fails
  assert.equal(verifyToken(`${result.session.token}tampered`), null)

  // Duplicate registration fails
  await assert.rejects(
    () => registerUser({
      username: testUser,
      password: 'securePassword123',
      inviteCode: 'TESTAB',
    }),
    /该用户名已被占用/
  )

  // Login succeeds
  const loginResult = await loginUser({
    username: testUser,
    password: 'securePassword123',
  })
  assert.equal(loginResult.success, true)
  assert.equal(loginResult.session.user.username, testUser)

  // Login with wrong password fails
  await assert.rejects(
    () => loginUser({
      username: testUser,
      password: 'wrongPassword',
    }),
    /用户名或密码错误/
  )
})

test('handleAuthApi handles HTTP route dispatch correctly', async () => {
  const req = {
    method: 'POST',
    url: '/api/auth/logout',
    headers: { host: 'localhost:8080' },
  }
  let statusCode = 0
  let responseData = null
  const res = {}
  const helpers = {
    readJson: async () => ({}),
    json: (r, code, data) => {
      statusCode = code
      responseData = data
    },
  }

  const handled = await handleAuthApi(req, res, helpers)
  assert.equal(handled, true)
  assert.equal(statusCode, 200)
  assert.equal(responseData?.success, true)

  const nonAuthReq = {
    method: 'GET',
    url: '/api/chat',
    headers: { host: 'localhost:8080' },
  }
  const notHandled = await handleAuthApi(nonAuthReq, res, helpers)
  assert.equal(notHandled, false)
})


test('unconfigured registration is closed and rotating codes removes the previous code', async () => {
  try {
    delete process.env.INVITE_CODES
    const closed = await import('./auth.mjs?closed-registration')
    assert.equal(closed.VALID_INVITE_CODES.size, 0)
    await assert.rejects(closed.registerUser({ username: 'closed_reader', password: 'test-password', inviteCode: 'TESTAB' }), /邀请码无效/)
    process.env.INVITE_CODES = ' newabc, NEWDEF '
    const rotated = await import('./auth.mjs?rotated-registration')
    assert.deepEqual([...rotated.VALID_INVITE_CODES], ['NEWABC', 'NEWDEF'])
    assert.equal(rotated.VALID_INVITE_CODES.has('TESTAB'), false)
  } finally { process.env.INVITE_CODES = 'TESTAB' }
})
