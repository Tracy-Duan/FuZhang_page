export interface AuthUser {
  id: string
  username: string
  nickname: string
  avatar?: string
  role?: 'tester' | 'admin' | 'user'
  createdAt: number
  inviteCodeUsed?: string
}

export interface AuthSession {
  token: string
  user: AuthUser
  expiresAt: number
}

export type AuthMode = 'login' | 'register'

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  username: string
  password: string
  inviteCode: string
  nickname?: string
}

export interface AuthResponse {
  success: boolean
  session?: AuthSession
  error?: string
}
