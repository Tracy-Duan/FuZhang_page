import { useCallback, useRef } from 'react'
import { BookOpen, Info, MessageSquare, UserRound, X } from 'lucide-react'
import { BrandLogo } from '../BrandLogo'
import { AccountDetails } from '../AccountControl'
import { useBookSpirit } from '../bookSpiritStore'
import type { SettingsTab } from '../bookSpiritStore'
import { useDialogFocus } from '../useDialogFocus'
import { CompanionPreferences, ConversationData, AboutFuzhang } from './SettingsPanels'
import './settings.css'

const tabs = [
  { id: 'account', label: '账号', description: '管理你的登录信息', icon: UserRound },
  { id: 'spirit', label: '阿箬', description: '一册小书，慢慢熟悉你的习惯。', icon: BookOpen },
  { id: 'conversation', label: '对话与数据', description: '查看阅读足迹，管理这台设备上的记录。', icon: MessageSquare },
  { id: 'about', label: '关于服章', description: '让传统之美，成为可穿的日常。', icon: Info },
] as const

export function SettingsDialog() {
  const spirit = useBookSpirit()
  const { setSettingsOpen } = spirit
  const dialog = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setSettingsOpen(false), [setSettingsOpen])
  useDialogFocus(true, dialog, close, spirit.settingsTrigger)
  const active = tabs.find(tab => tab.id === spirit.settingsTab) || tabs[0]
  function select(tab: SettingsTab) {
    spirit.setSettingsTab(tab)
    if (content.current) content.current.scrollTop = 0
  }
  return <div className="fz-settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="fz-settings-title" className="fz-settings-dialog">
      <aside className="fz-settings-sidebar">
        <div className="fz-settings-brand"><BrandLogo /><div><strong>服章</strong><span>个人中心</span></div></div>
        <nav role="tablist" aria-label="设置分类" className="fz-settings-nav">
          {tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} id={`settings-${id}`} role="tab"
            aria-selected={active.id === id} aria-controls="settings-content" tabIndex={active.id === id ? 0 : -1}
            onClick={() => select(id)} onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const index = tabs.findIndex(tab => tab.id === id)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : tabs.length - 1)) % tabs.length
              select(tabs[next].id)
              document.getElementById(`settings-${tabs[next].id}`)?.focus()
            }}><Icon size={18} strokeWidth={1.6} /><span>{label}</span></button>)}
        </nav>
        <div className="fz-settings-local-note"><span>偏好自动保存在本机</span><small>v0.2.0</small></div>
      </aside>
      <div className="fz-settings-main">
        <header className="fz-settings-heading"><div><h2 id="fz-settings-title">{active.label}</h2><p>{active.description}</p></div></header>
        <button type="button" className="fz-settings-close" aria-label="关闭设置" onClick={close}><X size={21} strokeWidth={1.6} /></button>
        <div ref={content} id="settings-content" className="fz-settings-content" role="tabpanel" tabIndex={0} aria-labelledby={`settings-${active.id}`} key={active.id}>
          {active.id === 'account' ? <AccountDetails close={close} />
            : active.id === 'spirit' ? <CompanionPreferences close={close} />
            : active.id === 'conversation' ? <ConversationData /> : <AboutFuzhang />}
        </div>
      </div>
    </section>
  </div>
}
