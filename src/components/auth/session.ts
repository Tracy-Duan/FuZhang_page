export const SESSION_KEY = 'fuzhang.auth.session.v1'
export const AUTH_EXPIRED_EVENT = 'fuzhang:auth-expired'

export function sessionHeaders(): Record<string, string> {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    return typeof session?.token === 'string' ? { Authorization: `Bearer ${session.token}` } : {}
  } catch { return {} }
}

export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  if (!url.startsWith('/api/')) throw new Error('会话凭据只能发送到服章接口')
  const headers = new Headers(options.headers)
  for (const [name, value] of Object.entries(sessionHeaders())) headers.set(name, value)
  const response = await fetch(url, { ...options, headers })
  if (response.status === 401) {
    localStorage.removeItem(SESSION_KEY)
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
  return response
}
