import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthMode, AuthSession, AuthUser, LoginPayload, RegisterPayload } from './types'
import { loginWithLegacyAccount, requestAuth } from './authClient'
import { AUTH_EXPIRED_EVENT, SESSION_KEY, sessionHeaders } from './session'

function loadSavedSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session: AuthSession = JSON.parse(raw)
    if (session && session.user && session.token && !session.token.startsWith('local-token-') && session.expiresAt > Date.now()) {
      return session
    }
    localStorage.removeItem(SESSION_KEY)
  } catch {
    localStorage.removeItem(SESSION_KEY)
  }
  return null
}

function saveSession(session: AuthSession | null) {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {
    // LocalStorage write failed
  }
}

interface AuthContextValue {
  user: AuthUser | null
  session: AuthSession | null
  isAuthenticated: boolean
  isCheckingSession: boolean
  isModalOpen: boolean
  authMode: AuthMode
  openAuthModal: (mode?: AuthMode, onSuccess?: () => void) => void
  closeAuthModal: () => void
  setAuthMode: (mode: AuthMode) => void
  requireAuth: (callback: () => void, mode?: AuthMode) => boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadSavedSession)
  const [verified, setVerified] = useState(false)
  const [isCheckingSession, setCheckingSession] = useState(Boolean(session))
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null)

  const user = verified ? session?.user ?? null : null
  const isAuthenticated = Boolean(user)

  const openAuthModal = (mode: AuthMode = 'login', onSuccess?: () => void) => {
    setAuthMode(mode)
    setPendingCallback(onSuccess ? () => onSuccess : null)
    setIsModalOpen(true)
  }

  const closeAuthModal = () => {
    setIsModalOpen(false)
    setPendingCallback(null)
  }

  const handleAuthSuccess = (newSession: AuthSession) => {
    setVerified(true)
    setCheckingSession(false)
    setSession(newSession)
    saveSession(newSession)
    setIsModalOpen(false)
    if (pendingCallback) {
      const cb = pendingCallback
      setPendingCallback(null)
      setTimeout(cb, 50)
    }
  }

  useEffect(() => {
    if (!session) { setVerified(false); setCheckingSession(false); return }
    const controller = new AbortController()
    void fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` }, signal: controller.signal })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok || payload.user?.id !== session.user.id || session.expiresAt <= Date.now()) throw new Error('invalid_session')
        if (!controller.signal.aborted) { setVerified(true); setCheckingSession(false) }
      }).catch(() => {
        if (!controller.signal.aborted) { setSession(null); setVerified(false); setCheckingSession(false); saveSession(null) }
      })
    return () => controller.abort()
  }, [session])

  useEffect(() => {
    const expired = () => {
      setSession(null); setVerified(false); setCheckingSession(false); saveSession(null)
      setPendingCallback(null); setAuthMode('login'); setIsModalOpen(true)
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    let timer: number | undefined
    function scheduleExpiry() {
      if (!session) return
      const remaining = session.expiresAt - Date.now()
      if (remaining <= 0) expired()
      else timer = window.setTimeout(scheduleExpiry, Math.min(2147483647, remaining))
    }
    scheduleExpiry()
    return () => { window.removeEventListener(AUTH_EXPIRED_EVENT, expired); window.clearTimeout(timer) }
  }, [session])

  const requireAuth = (callback: () => void, mode: AuthMode = 'login'): boolean => {
    if (isAuthenticated) {
      callback()
      return true
    }
    openAuthModal(mode, callback)
    return false
  }

  const login = async ({ username, password }: LoginPayload): Promise<void> => {
    const cleanUser = username.trim()
    if (!cleanUser) throw new Error('请输入用户名')
    if (!password) throw new Error('请输入密码')

    handleAuthSuccess(await loginWithLegacyAccount({ username: cleanUser, password }))
  }

  const register = async ({ username, password, inviteCode, nickname }: RegisterPayload): Promise<void> => {
    const cleanUser = username.trim()
    const cleanCode = inviteCode.trim().toUpperCase()
    const displayName = nickname?.trim() || cleanUser

    if (!cleanUser) throw new Error('请输入用户名')
    if (cleanUser.length < 2 || cleanUser.length > 20) throw new Error('用户名需在 2 到 20 个字符之间')
    if (!password || password.length < 6) throw new Error('密码不能少于 6 位')
    if (!cleanCode) throw new Error('首批内测需填写邀请码')

    handleAuthSuccess(await requestAuth('register', { username: cleanUser, password, inviteCode: cleanCode, nickname: displayName }))
  }

  const logout = async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: sessionHeaders() })
    if (!response.ok) throw new Error('退出失败，请重试')
    setSession(null)
    setVerified(false)
    saveSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated,
        isCheckingSession,
        isModalOpen,
        authMode,
        openAuthModal,
        closeAuthModal,
        setAuthMode,
        requireAuth,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
