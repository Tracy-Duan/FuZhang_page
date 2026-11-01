import { LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from './auth'
import { useBookSpirit } from './bookSpiritStore'

export function AccountControl() {
  const { user, isAuthenticated, openAuthModal } = useAuth()
  const spirit = useBookSpirit()
  const name = isAuthenticated && user ? user.nickname || user.username : '登录/注册'
  return <button className="account-launcher" data-auth-entry type="button" aria-label={isAuthenticated ? '打开个人中心' : '登录/注册'} onClick={() => {
    spirit.setChatOpen(false)
    if (isAuthenticated) spirit.openSettings()
    else openAuthModal('login')
  }}>
    {isAuthenticated ? <span className="account-avatar">{name.slice(0, 1)}</span> : <UserRound size={18} />}
    <span>{name}</span>
  </button>
}

export function AccountDetails({ close }: { close: () => void }) {
  const { user, logout } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  const [leaving, setLeaving] = useState(false)
  if (!user) return null
  const name = user.nickname || user.username
  const joined = Number.isFinite(user.createdAt) ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(user.createdAt) : '—'
  return <>
    <div className="fz-settings-profile"><span className="fz-settings-avatar" aria-hidden="true">{Array.from(name)[0]}</span><div><h3>{name}</h3><p>@{user.username}</p></div></div>
    <dl className="fz-settings-facts">
      <div><dt>用户名</dt><dd>{user.username}</dd></div>
      <div><dt>账号类型</dt><dd>{user.role === 'admin' ? '管理员' : user.role === 'tester' ? '内测用户' : '用户'}</dd></div>
      <div><dt>加入时间</dt><dd>{joined}</dd></div>
    </dl>
    <div className="fz-settings-session"><div><h3>登录状态</h3><p>当前设备已登录</p></div>
      <button type="button" className="fz-settings-button fz-settings-danger" disabled={leaving} onClick={async () => {
        setLeaving(true); setLogoutError('')
        try { await logout(); close() } catch { setLogoutError('退出失败，请重试'); setLeaving(false) }
      }}><LogOut size={15} />{leaving ? '正在退出…' : '退出登录'}</button>
    </div>
    {logoutError ? <p className="fz-settings-error" role="alert">{logoutError}</p> : null}
  </>
}
