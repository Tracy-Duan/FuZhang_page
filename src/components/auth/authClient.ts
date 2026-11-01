import type { AuthSession, LoginPayload, RegisterPayload } from './types'

export const LOCAL_ACCOUNTS_KEY = 'fuzhang.auth.local_accounts.v1'
export class AuthRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function requestAuth(action: 'login' | 'register', payload: LoginPayload | RegisterPayload): Promise<AuthSession> {
  let response: Response
  try {
    response = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  } catch { throw new AuthRequestError('暂时连接不上登录服务，请稍后重试。', 0) }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new AuthRequestError(response.status === 404 ? '登录服务尚未就绪，请稍后重试。' : typeof data.error === 'string' ? data.error : '登录未成功，请稍后重试。', response.status)
  const session = data.session
  if (!session || typeof session.token !== 'string' || !session.token || typeof session.user?.username !== 'string' || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
    throw new AuthRequestError('登录服务没有返回有效会话，请稍后重试。', 502)
  }
  return session
}

/** A verified legacy password can migrate its account, but can never bypass server authentication. */
export async function loginWithLegacyAccount(payload: LoginPayload, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): Promise<AuthSession> {
  try { return await requestAuth('login', payload) }
  catch (error) {
    if (!(error instanceof AuthRequestError) || error.status !== 401) throw error
    let accounts: Record<string, { passwordHash?: string; user?: { username?: string; nickname?: string; inviteCodeUsed?: string } }>
    try { accounts = JSON.parse(storage.getItem(LOCAL_ACCOUNTS_KEY) || '{}') } catch { throw error }
    const key = payload.username.toLowerCase(), legacy = accounts?.[key]
    if (!legacy || legacy.passwordHash !== payload.password || typeof legacy.user?.username !== 'string' || legacy.user.username.toLowerCase() !== key || typeof legacy.user.inviteCodeUsed !== 'string' || !legacy.user.inviteCodeUsed) throw error
    // Registration still checks the invite and rejects collisions. Existing server passwords are never overwritten.
    const session = await requestAuth('register', { ...payload, nickname: legacy.user.nickname, inviteCode: legacy.user.inviteCodeUsed })
    try {
      const latest = JSON.parse(storage.getItem(LOCAL_ACCOUNTS_KEY) || '{}')
      delete latest[key]
      storage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(latest))
    } catch { /* Keep the successful server session even if optional legacy cleanup is unavailable. */ }
    return session
  }
}
