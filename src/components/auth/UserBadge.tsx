import { useEffect, useRef, useState } from 'react'
import { LogOut, User, KeyRound, ChevronDown } from 'lucide-react'
import { useAuth } from './authStore'
import './auth.css'

export function UserBadge() {
  const { user, isAuthenticated, openAuthModal, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  if (!isAuthenticated || !user) {
    return (
      <button
        type="button"
        className="fz-user-login-trigger"
        onClick={() => openAuthModal('login')}
        aria-label="登录或激活内测账号"
      >
        <KeyRound size={14} />
        <span>登录 / 激活</span>
      </button>
    )
  }

  const initial = (user.nickname || user.username || '同').slice(0, 1).toUpperCase()

  return (
    <div className="fz-user-badge-wrap" ref={menuRef}>
      <button
        type="button"
        className="fz-user-badge-btn"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label={`已登录：${user.nickname || user.username}`}
      >
        <span className="fz-user-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="fz-user-name">{user.nickname || user.username}</span>
        <ChevronDown size={14} style={{ opacity: 0.6 }} />
      </button>

      {menuOpen && (
        <div className="fz-user-menu" role="menu">
          <div className="fz-user-menu-header">
            <strong>{user.nickname || user.username}</strong>
            <small>用户名: {user.username}</small>
          </div>
          <button
            type="button"
            className="fz-user-menu-item logout"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              logout()
            }}
          >
            <LogOut size={14} />
            <span>退出登录</span>
          </button>
        </div>
      )}
    </div>
  )
}
