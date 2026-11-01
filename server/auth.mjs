import { randomUUID, randomBytes, pbkdf2Sync, createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USERS_FILE = path.resolve(process.env.AUTH_USERS_FILE || path.join(__dirname, 'rag-data', 'users.json'))
// An unconfigured dev instance must never use a publicly known signing key.
const TOKEN_SECRET = process.env.AUTH_SECRET?.trim() || randomBytes(32).toString('hex')

// Registration is closed until the operator configures private invite codes.
const envCodes = process.env.INVITE_CODES ? process.env.INVITE_CODES.split(',').map((c) => c.trim().toUpperCase()) : []
export const VALID_INVITE_CODES = new Set(envCodes.filter(Boolean))

let cachedUsers = null
let registrations = Promise.resolve()

async function loadUsers() {
  if (cachedUsers) return cachedUsers
  try {
    const raw = await readFile(USERS_FILE, 'utf8')
    cachedUsers = JSON.parse(raw)
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('账号资料暂时无法读取，请稍后重试')
    cachedUsers = {}
  }
  return cachedUsers
}

async function saveUsers(users) {
  const temporary = `${USERS_FILE}.${randomUUID()}.tmp`
  try {
    await mkdir(path.dirname(USERS_FILE), { recursive: true })
    await writeFile(temporary, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, USERS_FILE)
    cachedUsers = users
  } catch {
    await rm(temporary, { force: true }).catch(() => {})
    throw new Error('账号暂时无法保存，请稍后重试')
  }
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedCombined) {
  if (!storedCombined || !storedCombined.includes(':')) return false
  const [salt, expectedHash] = storedCombined.split(':')
  const actualHash = pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex')
  return actualHash === expectedHash
}

function createToken(userId, username) {
  const expiresAt = Date.now() + 30 * 24 * 3600 * 1000 // 30 days
  const payload = Buffer.from(JSON.stringify({ userId, username, expiresAt, sessionId: randomUUID() })).toString('base64url')
  const signature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 2) return null
  const [payloadStr, signature] = token.split('.')
  const expectedSig = createHmac('sha256', TOKEN_SECRET).update(payloadStr).digest('base64url')
  const supplied = Buffer.from(signature), expected = Buffer.from(expectedSig)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'))
    if (!payload || typeof payload.userId !== 'string' || !payload.userId || typeof payload.username !== 'string' || !payload.username ||
      typeof payload.sessionId !== 'string' || !payload.sessionId || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function authenticatedUser(req) {
  const header = req.headers?.authorization
  if (typeof header !== 'string' || !/^Bearer \S+$/i.test(header)) return null
  const payload = verifyToken(header.slice(7))
  if (!payload) return null
  const users = await loadUsers()
  const user = Object.hasOwn(users, payload.username.toLowerCase()) ? users[payload.username.toLowerCase()] : null
  if (!user || user.id !== payload.userId || user.revokedSessions?.some(session => session.id === payload.sessionId)) return null
  return { user, payload }
}

async function revokeSession(req) {
  const operation = registrations.then(async () => {
    const current = await authenticatedUser(req)
    if (!current) return
    const { user, payload } = current
    const revokedSessions = [...(user.revokedSessions || []).filter(session => session.expiresAt > Date.now()), { id: payload.sessionId, expiresAt: payload.expiresAt }]
    await saveUsers({ ...await loadUsers(), [user.username.toLowerCase()]: { ...user, revokedSessions } })
  })
  registrations = operation.then(() => {}, () => {})
  return operation
}

export function registerUser(input) {
  const result = registrations.then(() => registerSerial(input))
  registrations = result.then(() => {}, () => {})
  return result
}

async function registerSerial({ username, password, inviteCode, nickname }) {
  const cleanUsername = String(username || '').trim()
  const cleanPassword = String(password || '')
  const cleanCode = String(inviteCode || '').trim().toUpperCase()
  const cleanNickname = String(nickname || '').trim() || cleanUsername

  if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 20) {
    throw new Error('用户名需在 2 到 20 个字符之间')
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('密码不能少于 6 位')
  }
  if (!VALID_INVITE_CODES.has(cleanCode)) {
    throw new Error('邀请码无效或已失效')
  }

  const users = { ...await loadUsers() }
  const lowerUser = cleanUsername.toLowerCase()
  if (users[lowerUser]) {
    throw new Error('该用户名已被占用，请直接登录或换一个用户名')
  }

  const newUser = {
    id: randomUUID(),
    username: cleanUsername,
    nickname: cleanNickname,
    role: 'tester',
    passwordHash: hashPassword(cleanPassword),
    inviteCodeUsed: cleanCode,
    createdAt: Date.now(),
  }

  users[lowerUser] = newUser
  await saveUsers(users)

  const token = createToken(newUser.id, newUser.username)
  const safeUser = {
    id: newUser.id,
    username: newUser.username,
    nickname: newUser.nickname,
    role: newUser.role,
    createdAt: newUser.createdAt,
    inviteCodeUsed: newUser.inviteCodeUsed,
  }

  return {
    success: true,
    session: {
      token,
      user: safeUser,
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
    },
  }
}

export async function loginUser({ username, password }) {
  const cleanUsername = String(username || '').trim()
  const cleanPassword = String(password || '')

  if (!cleanUsername || !cleanPassword) {
    throw new Error('请输入用户名和密码')
  }

  const users = await loadUsers()
  const userRecord = users[cleanUsername.toLowerCase()]
  if (!userRecord || !verifyPassword(cleanPassword, userRecord.passwordHash)) {
    throw new Error('用户名或密码错误')
  }

  const token = createToken(userRecord.id, userRecord.username)
  const safeUser = {
    id: userRecord.id,
    username: userRecord.username,
    nickname: userRecord.nickname || userRecord.username,
    role: userRecord.role || 'tester',
    createdAt: userRecord.createdAt || Date.now(),
    inviteCodeUsed: userRecord.inviteCodeUsed,
  }

  return {
    success: true,
    session: {
      token,
      user: safeUser,
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
    },
  }
}

export async function handleAuthApi(req, res, { readJson, json }) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const body = await readJson(req)
      const result = await registerUser(body)
      json(res, 200, result)
      return true
    } catch (err) {
      json(res, 400, { error: err.message || '注册失败' })
      return true
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const body = await readJson(req)
      const result = await loginUser(body)
      json(res, 200, result)
      return true
    } catch (err) {
      json(res, 401, { error: err.message || '登录失败' })
      return true
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const current = await authenticatedUser(req)
    if (!current) {
      json(res, 401, { error: '未登录或登录已过期' })
      return true
    }
    const userRecord = current.user
    json(res, 200, {
      user: {
        id: userRecord.id,
        username: userRecord.username,
        nickname: userRecord.nickname,
        role: userRecord.role,
        createdAt: userRecord.createdAt,
      },
    })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    await revokeSession(req)
    json(res, 200, { success: true })
    return true
  }

  return false
}
