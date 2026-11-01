import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, X } from 'lucide-react'
import { companionPlacement } from './companionPlacement'
import { streamCompanion } from '../api'
import { readLocal, spiritKeys, useBookSpirit, writeLocal } from './bookSpiritStore'
import { loadCompanionMessages, localDay } from './companionMessages'
import type { CompanionMessage } from './companionMessages'
import { useDialogFocus } from './useDialogFocus'

/** Keep at most the newest reaction line so it does not crowd out the real conversation. */
function contextMessages(messages: CompanionMessage[]) {
  let keptReaction = false
  const result: CompanionMessage[] = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.kind === 'crisis') continue
    if (message.kind === 'reaction') {
      if (keptReaction) continue
      keptReaction = true
    }
    result.push(message)
  }
  return result.reverse()
}

export function CompanionChat() {
  const spirit = useBookSpirit()
  const [messages, setMessages] = useState(loadCompanionMessages)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState('')
  const [intro, setIntro] = useState(false)
  const root = useRef<HTMLElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const sending = useRef(false)
  const unresolvedUser = useRef<string | null>(null)
  const close = useCallback(() => spirit.setChatOpen(false), [spirit.setChatOpen])
  useDialogFocus(spirit.chatOpen, root, close, spirit.petButton, false)
  useEffect(() => { if (spirit.chatOpen && innerWidth >= 700) root.current?.querySelector('input')?.focus({ preventScroll: true }) }, [spirit.chatOpen])
  useEffect(() => {
    if (!spirit.chatOpen) return
    try {
      if (localStorage.getItem('fuzhang.book-spirit.met') !== '1') {
        localStorage.setItem('fuzhang.book-spirit.met', '1')
        setIntro(true)
      }
    } catch { /* Local preference is optional. */ }
  }, [spirit.chatOpen])
  // Wait for classification before persisting the new turn; crisis turns stay ephemeral.
  useEffect(() => { writeLocal(spiritKeys.chat, messages.filter(m => m.kind !== 'crisis' && m.id !== unresolvedUser.current).slice(-120)) }, [messages])
  useEffect(() => {
    const note = spirit.archiveNote
    if (!note) return
    setMessages((current) => {
      if (current.some((message) => message.id === note.id)) return current
      const next = [...current, { id: note.id, role: 'assistant' as const, content: note.text, createdAt: note.at, kind: 'reaction' as const }]
      const reactions = next.filter((message) => message.kind === 'reaction')
      const drop = new Set(reactions.slice(0, Math.max(0, reactions.length - 40)).map((message) => message.id))
      return next.filter((message) => !drop.has(message.id)).slice(-120)
    })
  }, [spirit.archiveNote])
  useEffect(() => {
    generation.current += 1
    abort.current?.abort()
    sending.current = false
    unresolvedUser.current = null
    setMessages(loadCompanionMessages())
    setPending('')
    spirit.setChatBusy(false)
  }, [spirit.memoryVersion, spirit.setChatBusy])
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { const pane = bottom.current?.parentElement; if (pane) pane.scrollTop = pane.scrollHeight }, [messages, pending, spirit.chatOpen])
  useEffect(() => {
    if (!spirit.chatOpen) return
    let frame = 0, previous = ''
    function place() {
      frame = requestAnimationFrame(place)
      const node = root.current
      if (!node) return
      const viewport = window.visualViewport
      let vx = viewport?.offsetLeft || 0, vy = viewport?.offsetTop || 0
      let vw = viewport?.width || innerWidth, vh = viewport?.height || innerHeight
      const host = node.parentElement?.classList.contains('mobile-book-world') ? node.parentElement : null
      const scope = host?.getBoundingClientRect()
      if (scope) {
        const right = Math.min(vx + vw, scope.right), bottom = Math.min(vy + vh, scope.bottom)
        vx = Math.max(vx, scope.left);vy = Math.max(vy, scope.top)
        vw = Math.max(25, right - vx);vh = Math.max(25, bottom - vy)
      }
      const pet = spirit.petButton.current?.getBoundingClientRect()
      const placed = companionPlacement({ left: vx, top: vy, width: vw, height: vh }, pet)
      const left = placed.left - (scope?.left || 0), top = placed.top - (scope?.top || 0)
      const { width, height } = placed
      const key = [left, top, width, height].map(n => Math.round(n)).join(',')
      if (key !== previous) {
        previous = key
        node.style.setProperty('--chat-left', `${left}px`)
        node.style.setProperty('--chat-top', `${top}px`)
        Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })
      }
    }
    function outside(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node) || root.current?.contains(target) || spirit.petButton.current?.contains(target)) return
      close()
    }
    frame = requestAnimationFrame(place)
    document.addEventListener('pointerdown', outside, true)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside, true) }
  }, [spirit.chatOpen, spirit.petButton, close])

  async function send() {
    const text = value.trim()
    if (!text || sending.current) return
    const run = ++generation.current
    sending.current = true; setValue('')
    const user: CompanionMessage = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: Date.now() }
    unresolvedUser.current = user.id
    const next = [...messages, user].slice(-120)
    setMessages(next)
    const append = (content: string, referral?: string) => setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant' as const, content, referral, createdAt: Date.now() }].slice(-120))
    const date = localDay(), quota = readLocal<{ date: string; count: number }>(spiritKeys.quota, { date, count: 0 })
    const count = quota.date === date && Number.isFinite(quota.count) ? Math.max(0, quota.count) : 0
    if (count >= 40) { unresolvedUser.current = null; append('今天聊太多了'); sending.current = false; return }
    writeLocal(spiritKeys.quota, { date, count: count + 1 })
    spirit.setChatBusy(true); setPending('……'); abort.current = new AbortController()
    try {
      let partial = ''
      const result = await streamCompanion(contextMessages(next), spirit.page, delta => { if (run === generation.current) { partial += delta; setPending(partial) } }, abort.current.signal)
      if (run === generation.current) {
        if (result.crisis) setMessages(current => [...current.map(m => m.id === user.id ? { ...m, kind: 'crisis' as const } : m),
          { id: crypto.randomUUID(), role: 'assistant' as const, content: result.answer, createdAt: Date.now(), kind: 'crisis' as const }].slice(-120))
        else if (!result.silent) append(result.answer, result.referral)
        else setMessages(current => [...current])
      }
    } catch { if (run === generation.current) append('我卡住了') }
    finally { if (run === generation.current) { unresolvedUser.current = null; setPending(''); spirit.setChatBusy(false); sending.current = false } }
  }
  if (!spirit.chatOpen) return null
  const hour = new Date().getHours()
  const greeting = intro && messages.length === 0
    ? '你翻到我了。……别怕，我不是鬼。'
    : spirit.mainState === 'empty'
      ? '这一页是空的。……换个问法，或者去问大服章。'
      : hour >= 22 || hour < 6
        ? '灯芯要剪了。你也该歇了。'
        : '我在。想说话就说，不想说也行。'
  const portalTarget = document.querySelector('.mobile-book-world') || document.body
  return createPortal(<section ref={root} className="companion-chat" role="dialog" aria-modal="false" aria-labelledby="companion-chat-title">
    <header><div><strong id="companion-chat-title">{spirit.preferences.name || '阿箬'}</strong><span>书页间，歇一会儿</span></div><button type="button" onClick={close} aria-label="关闭阿箬聊天"><X size={17} /></button></header>
    <div className="companion-chat-messages" role="log" aria-label="陪聊消息" aria-live="polite" aria-relevant="additions text">
      <div className="companion-bubble assistant">{greeting}</div>
      {messages.map(m => <div className={`companion-bubble ${m.role} ${m.kind === 'reaction' ? 'reaction' : ''}`} key={m.id}><p>{m.content}</p>{m.referral ? <button type="button" className="companion-refer" onClick={() => spirit.prefill(m.referral!)}>去问大服章 →</button> : null}</div>)}
      {pending ? <div className="companion-bubble assistant" aria-label="阿箬正在翻页">{pending}</div> : null}<div ref={bottom} />
    </div>
    <form className="companion-chat-input" onSubmit={event => { event.preventDefault(); void send() }}>
      <input aria-label="和阿箬说话" value={value} maxLength={500} placeholder="跟她说句话…" autoComplete="off" onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault() }} />
      <button type="submit" aria-label="发送陪聊消息" disabled={spirit.chatBusy || !value.trim()}><ArrowUp size={17} /></button>
    </form>
  </section>, portalTarget)
}
