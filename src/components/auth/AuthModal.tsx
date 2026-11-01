import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, KeyRound, Loader2, Sparkles } from 'lucide-react'
import { useAuth } from './authStore'
import { useBookSpirit } from '../bookSpiritStore'
import { BrandLogo } from '../BrandLogo'
import { useDialogFocus } from '../useDialogFocus'
import { AuthSpiritDirector } from './authSpirit'
import type { AuthSpiritEvent } from './authSpirit'
import './auth.css'

export function AuthModal() {
  const { isModalOpen, closeAuthModal, authMode, setAuthMode, login, register } = useAuth()
  const spirit = useBookSpirit()
  const shell = useRef<HTMLElement>(null)
  const perch = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const director = useRef<AuthSpiritDirector | undefined>(undefined)
  const closeLatest = useRef(closeAuthModal)
  closeLatest.current = closeAuthModal
  const close = useCallback(() => closeLatest.current(), [])
  const [caption, setCaption] = useState('我先上来，替你扶着这一页。')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  function respond(event: AuthSpiritEvent) {
    const line = director.current?.react(event, performance.now())
    if (line) setCaption(line)
  }
  function gaze(input: HTMLInputElement) {
    if (input.type === 'password') return
    const field = input.getBoundingClientRect(), pet = spirit.petButton.current?.getBoundingClientRect()
    if (!pet) return
    const caret = field.left + 12 + (input.selectionStart || 0) * 8 - input.scrollLeft
    director.current?.lookAt((caret - pet.left - pet.width / 2) / Math.max(60, field.width * .3), performance.now())
  }
  function switchMode(mode: 'login' | 'register') {
    if (loading) return
    setAuthMode(mode);setError('');respond('mode')
  }

  useLayoutEffect(() => {
    if (!isModalOpen || !perch.current) return
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const origin = spirit.petButton.current?.getBoundingClientRect() || perch.current.getBoundingClientRect()
    const scene = new AuthSpiritDirector(performance.now())
    director.current = scene
    setCaption(scene.react('arrive', performance.now()))
    spirit.setChatOpen(false);spirit.setSettingsOpen(false)
    const target = perch.current
    spirit.setAuthDock({ target, origin: { left: origin.left, top: origin.top }, director: scene,
      onTap: () => setCaption(scene.react('tap', performance.now())) })
    function viewport() {
      backdrop.current?.style.setProperty('--auth-vh', `${window.visualViewport?.height || innerHeight}px`)
      backdrop.current?.style.setProperty('--auth-top', `${window.visualViewport?.offsetTop || 0}px`)
    }
    viewport();window.visualViewport?.addEventListener('resize', viewport);window.visualViewport?.addEventListener('scroll', viewport)
    window.addEventListener('resize', viewport)
    return () => {
      spirit.setAuthDock(current => current?.target === target ? undefined : current)
      director.current = undefined
      window.visualViewport?.removeEventListener('resize', viewport);window.visualViewport?.removeEventListener('scroll', viewport)
      window.removeEventListener('resize', viewport)
    }
  }, [isModalOpen, spirit.setAuthDock, spirit.setChatOpen, spirit.setSettingsOpen, spirit.petButton])

  useDialogFocus(isModalOpen, shell, close, trigger)

  // Clear inputs when modal opens or mode changes
  useEffect(() => {
    if (isModalOpen) {
      setError('')
      setLoading(false)
    }
  }, [isModalOpen, authMode])

  useEffect(() => {
    if (!isModalOpen) return
    shell.current?.querySelector<HTMLInputElement>('#fz-auth-user')?.focus()
  }, [isModalOpen])

  if (!isModalOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setError('')
    setLoading(true)
    respond('submit')

    try {
      if (authMode === 'login') {
        await login({ username, password })
      } else {
        await register({ username, password, inviteCode, nickname })
      }
      spirit.controller.interact('celebrate', performance.now(), spirit.preferences.temperament)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '操作失败，请重试')
      respond('error')
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return createPortal(
    <div
      ref={backdrop}
      className="fz-auth-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <section
        ref={shell}
        className="fz-auth-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fz-auth-title"
      >
        <div className="fz-auth-spirit-host" ref={perch} />
        <p className="fz-auth-spirit-speech" role="status" aria-live="polite">{caption}</p>
        <div className="fz-auth-card">
        <button
          className="fz-auth-close-btn"
          type="button"
          onClick={close}
          aria-label="关闭登录"
        >
          <X size={18} />
        </button>

        <header className="fz-auth-header">
          <div className="fz-auth-brand-badge">
            <BrandLogo />
            <span>服章 内测</span>
          </div>
          <h2 id="fz-auth-title" className="fz-auth-title">
            {authMode === 'login' ? '登入服章' : '激活内测资格'}
          </h2>
          <p className="fz-auth-subtitle">
            {authMode === 'login'
              ? '欢迎归来，继续查阅正史舆服与馆藏考据'
              : '首批用户定向邀请，凭邀请码激活'}
          </p>
        </header>

        <div className="fz-auth-tabs" role="tablist" aria-label="登录方式" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || loading) return
          event.preventDefault()
          const mode = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : authMode === 'login' ? 'register' : 'login'
          switchMode(mode);document.getElementById(`fz-auth-${mode}-tab`)?.focus()
        }}>
          <button
            type="button"
            role="tab"
            id="fz-auth-login-tab"
            aria-controls="fz-auth-fields"
            disabled={loading}
            aria-selected={authMode === 'login'}
            tabIndex={authMode === 'login' ? 0 : -1}
            className={`fz-auth-tab ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            账号登录
          </button>
          <button
            type="button"
            role="tab"
            id="fz-auth-register-tab"
            aria-controls="fz-auth-fields"
            disabled={loading}
            aria-selected={authMode === 'register'}
            tabIndex={authMode === 'register' ? 0 : -1}
            className={`fz-auth-tab ${authMode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            邀请码激活注册
          </button>
        </div>

        <form className="fz-auth-form" id="fz-auth-fields" role="tabpanel" aria-labelledby={authMode === 'login' ? 'fz-auth-login-tab' : 'fz-auth-register-tab'} aria-busy={loading} onSubmit={handleSubmit}
          onFocusCapture={event => {
            const input = event.target
            if (!(input instanceof HTMLInputElement)) return
            const events: Record<string, AuthSpiritEvent> = { 'fz-auth-user': 'username', 'fz-auth-pwd': 'password', 'fz-auth-code': 'invite', 'fz-auth-nick': 'nickname' }
            respond(events[input.id] || 'rest');gaze(input)
          }}
          onBlurCapture={event => { if (event.target instanceof HTMLInputElement && !loading) respond('rest') }}
          onInputCapture={event => { if (event.target instanceof HTMLInputElement) gaze(event.target) }}
          onSelectCapture={event => { if (event.target instanceof HTMLInputElement) gaze(event.target) }}
          onInvalidCapture={() => respond('error')}>
          {error && <div className="fz-auth-error" role="alert">{error}</div>}

          {authMode === 'register' && (
            <div className="fz-auth-field">
              <label className="fz-auth-label" htmlFor="fz-auth-code">
                <span>
                  内测邀请码<span className="fz-auth-required">*</span>
                </span>
              </label>
              <div className="fz-auth-input-wrap">
                <input
                  id="fz-auth-code"
                  type="text"
                  className="fz-auth-input invite-code-input"
                  placeholder="请输入六位大写字母邀请码"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  required
                  maxLength={6}
                  pattern="[A-Z]{6}"
                  autoComplete="off"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <div className="fz-auth-field">
            <label className="fz-auth-label" htmlFor="fz-auth-user">
              <span>
                用户名<span className="fz-auth-required">*</span>
              </span>
            </label>
            <div className="fz-auth-input-wrap">
              <input
                id="fz-auth-user"
                type="text"
                className="fz-auth-input"
                placeholder="2-20 个字符，可用于日常登录"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                maxLength={20}
                disabled={loading}
              />
            </div>
          </div>

          {authMode === 'register' && (
            <div className="fz-auth-field">
              <label className="fz-auth-label" htmlFor="fz-auth-nick">
                <span>同行昵称（选填）</span>
                <span className="fz-auth-tip">界面展示称呼</span>
              </label>
              <div className="fz-auth-input-wrap">
                <input
                  id="fz-auth-nick"
                  type="text"
                  className="fz-auth-input"
                  placeholder="如：青衫客、临安抄书人"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  autoComplete="nickname"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <div className="fz-auth-field">
            <label className="fz-auth-label" htmlFor="fz-auth-pwd">
              <span>
                密码<span className="fz-auth-required">*</span>
              </span>
              {authMode === 'register' && (
                <span className="fz-auth-tip">不少于 6 位</span>
              )}
            </label>
            <div className="fz-auth-input-wrap">
              <input
                id="fz-auth-pwd"
                type="password"
                className="fz-auth-input"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            className="fz-auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>{authMode === 'login' ? '正在登录…' : '正在激活…'}</span>
              </>
            ) : authMode === 'login' ? (
              <>
                <KeyRound size={16} />
                <span>立即登入</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>验证邀请码并激活</span>
              </>
            )}
          </button>

          <div className="fz-auth-footer-notes">
            {authMode === 'login' ? (
              <span>还没有激活码？请点击上方“邀请码激活注册”</span>
            ) : (
              <span>已有账号？请点击上方“账号登录”</span>
            )}
          </div>
        </form>
        </div>
      </section>
    </div>,
    document.body
  )
}
