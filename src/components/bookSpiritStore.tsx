import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BookSpiritController } from './bookSpiritController'
import type { BookPreferences } from './bookSpiritArt'
import type { AppView } from '../types'
import type { CompanionState } from './bookSpiritController'
import type { CompanionAlmanac } from './companionMessages'
import { archivedKinds, archiveGapMs, isDirectReaction, kindCooldownMs, pickReaction, speechGapMs } from './companionReactions'
import type { ReactionKind } from './companionReactions'
import type { AuthSpiritDock } from './auth/authSpirit'
import { useAuth } from './auth'
import { authenticatedFetch } from './auth/session'

export const spiritKeys = {
  preferences: 'fuzhang.book-spirit.v1', quiet: 'fuzhang.book-spirit.quiet', animation: 'fuzhang.book-spirit.animation',
  chat: 'fuzhang.book-spirit.chat.v1', seen: 'fuzhang.book-spirit.seen', reads: 'fuzhang.book-spirit.reads',
  home: 'fuzhang.book-spirit.home', quota: 'fuzhang.book-spirit.quota', reactions: 'fuzhang.book-spirit.reactions.v1',
}
export function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
export function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage is optional. */ }
}
const defaults: BookPreferences = { name: '阿箬', cover: 'sage', ribbon: 'cinnabar', temperament: 'quiet' }
function loadPreferences(): BookPreferences {
  const value = readLocal<Partial<BookPreferences>>(spiritKeys.preferences, {})
  return {
    name: typeof value.name === 'string' && value.name.trim() ? (value.name === '小书灵' ? '阿箬' : value.name.slice(0, 12)) : defaults.name,
    cover: ['sage', 'indigo', 'tea'].includes(value.cover || '') ? value.cover! : defaults.cover,
    ribbon: ['cinnabar', 'ochre', 'plum'].includes(value.ribbon || '') ? value.ribbon! : defaults.ribbon,
    temperament: ['quiet', 'curious', 'lively'].includes(value.temperament || '') ? value.temperament! : defaults.temperament,
  }
}
export type SettingsTab = 'account' | 'spirit' | 'conversation' | 'about'
function useSpiritStore() {
  const { isAuthenticated } = useAuth()
  const [preferences, setPreferences] = useState(loadPreferences)
  const [quiet, updateQuiet] = useState(() => readLocal<number>(spiritKeys.quiet, 0) === 1)
  const [animated, updateAnimated] = useState(() => readLocal<boolean>(spiritKeys.animation, true) !== false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account')
  const [chatOpen, setChatOpen] = useState(false)
  const [authDock, setAuthDock] = useState<AuthSpiritDock>()
  const [minimized, updateMinimized] = useState(() => { try { return sessionStorage.getItem('fuzhang.companion.v1') === 'minimized' } catch { return false } })
  const [chatBusy, setChatBusy] = useState(false)
  const [mainState, setMainState] = useState<CompanionState>('idle')
  const [night, setNight] = useState(() => new Date().getHours() >= 22 || new Date().getHours() < 6)
  const [day, setDay] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [almanac, setAlmanac] = useState<CompanionAlmanac>()
  const [returning] = useState(() => { const previous = Number(readLocal(spiritKeys.seen, 0)); return previous > 0 && Date.now() - previous >= 86400000 })
  const returned = useRef(false)
  const [page, setPage] = useState<{ view: AppView; topic: string }>({ view: 'home', topic: '' })
  const [draft, setDraft] = useState<{ text: string; id: number }>()
  const [reads, setReads] = useState(() => Math.max(0, Number(readLocal(spiritKeys.reads, 0)) || 0))
  const [memoryVersion, setMemoryVersion] = useState(0)
  const [reaction, setReaction] = useState<{ id: string; text: string; at: number; kind: ReactionKind }>()
  const [archiveNote, setArchiveNote] = useState<{ id: string; text: string; at: number }>()
  const recentLines = useRef<string[]>([])
  const lastSpokenAt = useRef(-Infinity)
  const lastArchivedAt = useRef(-Infinity)
  const kindLastAt = useRef<Partial<Record<ReactionKind, number>>>({})
  const reactionTimer = useRef<number | undefined>(undefined)
  const [onceSeen] = useState(() => {
    const stored = readLocal<unknown>(spiritKeys.reactions, [])
    return new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [])
  })
  const [controller] = useState(() => new BookSpiritController(performance.now()))
  const petButton = useRef<HTMLButtonElement | null>(null)
  const clearMainHistory = useRef<() => void>(() => {})
  const settingsTrigger = useRef<HTMLElement | null>(null)
  const readCount = useRef(reads)
  useEffect(() => {
    const markSeen = () => writeLocal(spiritKeys.seen, Date.now())
    const tick = () => { const h = new Date().getHours(); setNight(h >= 22 || h < 6); setDay(new Date().toLocaleDateString('sv-SE')); markSeen() }
    tick(); const timer = window.setInterval(tick, 60000)
    window.addEventListener('pagehide', markSeen); document.addEventListener('visibilitychange', markSeen)
    return () => { clearInterval(timer); window.removeEventListener('pagehide', markSeen); document.removeEventListener('visibilitychange', markSeen) }
  }, [])
  useEffect(() => {
    if (!isAuthenticated) { setAlmanac(undefined); return }
    const abort = new AbortController()
    void authenticatedFetch(`/api/companion/almanac?date=${day}`, { signal: abort.signal }).then(response => response.ok ? response.json() : undefined)
      .then(value => { if (value && typeof value.term === 'string' && Array.isArray(value.quotes) && !abort.signal.aborted) setAlmanac(value) }).catch(() => {})
    return () => abort.abort()
  }, [day, isAuthenticated])
  useEffect(() => { controller.night = night }, [controller, night])
  useEffect(() => () => { if (reactionTimer.current !== undefined) window.clearTimeout(reactionTimer.current) }, [])
  useEffect(() => {
    if (!returning || returned.current) return
    const timer = window.setTimeout(() => { returned.current = true; controller.interact('returning', performance.now(), preferences.temperament) }, 700)
    return () => clearTimeout(timer)
  }, [returning, controller, preferences.temperament])
  const react = useCallback((kind: ReactionKind, options: { force?: boolean } = {}) => {
    const direct = isDirectReaction(kind)
    if (quiet && !direct) return
    if (!direct && !options.force && ['thinking', 'searching', 'answering'].includes(mainState)) return
    const now = performance.now()
    if (!direct && now - lastSpokenAt.current < speechGapMs) return
    if (!direct && now - (kindLastAt.current[kind] ?? -Infinity) < kindCooldownMs[kind]) return
    const line = pickReaction(kind, { night, recent: recentLines.current, onceSeen })
    if (!line) return
    lastSpokenAt.current = now
    kindLastAt.current[kind] = now
    recentLines.current = [...recentLines.current, line.text].slice(-2)
    if (line.once) { onceSeen.add(kind); writeLocal(spiritKeys.reactions, [...onceSeen]) }
    const note = { id: crypto.randomUUID(), text: line.text, at: Date.now(), kind }
    setReaction(note)
    if (reactionTimer.current !== undefined) window.clearTimeout(reactionTimer.current)
    reactionTimer.current = window.setTimeout(() => setReaction((current) => current?.id === note.id ? undefined : current), 2_800)
    if ((chatOpen || archivedKinds.has(kind)) && ((chatOpen && direct) || now - lastArchivedAt.current >= archiveGapMs)) {
      lastArchivedAt.current = now
      setArchiveNote(note)
    }
  }, [quiet, mainState, night, onceSeen, chatOpen])
  function recordRead() {
    const count = ++readCount.current; setReads(count); writeLocal(spiritKeys.reads, count)
    if (count % 10 === 0) controller.interact('celebrate', performance.now(), preferences.temperament)
  }
  function updatePreferences(next: Partial<BookPreferences>) {
    setPreferences(current => { const updated = { ...current, ...next }; writeLocal(spiritKeys.preferences, updated); return updated })
  }
  function setQuiet(value: boolean) { updateQuiet(value); writeLocal(spiritKeys.quiet, value ? 1 : 0) }
  function setAnimated(value: boolean) { updateAnimated(value); writeLocal(spiritKeys.animation, value) }
  function setMinimized(value: boolean) { updateMinimized(value); setChatOpen(false); try { sessionStorage.setItem('fuzhang.companion.v1', value ? 'minimized' : 'visible') } catch { /* Optional session preference. */ } }
  function openSettings(tab: SettingsTab = 'account') {
    settingsTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSettingsTab(tab); setChatOpen(false); setSettingsOpen(true)
  }
  function prefill(text: string) { setChatOpen(false); setDraft({ text: text.slice(0, 1000), id: Date.now() }) }
  function clearMemory() { writeLocal(spiritKeys.chat, []); setMemoryVersion(value => value + 1) }
  return { preferences, updatePreferences, quiet, setQuiet, animated, setAnimated, settingsOpen, setSettingsOpen,
    settingsTab, setSettingsTab, openSettings, chatOpen, setChatOpen, page, setPage, draft, setDraft, prefill,
    reads, setReads, recordRead, react, reaction, archiveNote, night, returning, almanac, minimized, setMinimized, controller, petButton, clearMainHistory, settingsTrigger, memoryVersion, clearMemory, chatBusy, setChatBusy, mainState, setMainState, authDock, setAuthDock }
}
const SpiritContext = createContext<ReturnType<typeof useSpiritStore> | null>(null)
export function BookSpiritProvider({ children }: { children: ReactNode }) {
  const store = useSpiritStore()
  return <SpiritContext.Provider value={store}>{children}</SpiritContext.Provider>
}
export function useBookSpirit() {
  const store = useContext(SpiritContext)
  if (!store) throw new Error('BookSpiritProvider is missing')
  return store
}
