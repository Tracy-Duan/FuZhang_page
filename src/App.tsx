import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Header } from './components/Header'
import { BrandLogo } from './components/BrandLogo'
import { Sidebar } from './components/Sidebar'
import { Composer } from './components/Composer'
import { ResearchView } from './components/ResearchView'
import { Inspector } from './components/Inspector'
import { useBookSpirit } from './components/bookSpiritStore'
import { useAuth } from './components/auth'
import { streamHanfu } from './api'
import { loadHistory, saveHistory } from './history'
import { useDialogFocus } from './components/useDialogFocus'
import { useMediaQuery } from './components/useMediaQuery'
import { retrievedSources } from './citations'
import { knowledgeCopy } from './knowledgeCopy'
import { KnowledgeLibrary } from './components/KnowledgeLibrary'
import fuuZhangWordmark from './assets/fuuzhang-wordmark-v1.png'
import { libraryHash, librarySections, parseLibraryRoute } from './library'
import type { LibraryRoute } from './library'
import type { AppView, ChatAttachment, ChatImage, ChatMessage, HistoryItem, ProcessTraceStep, ResearchResult, ResearchSource } from './types'

function addRankedSource(current: ResearchSource[], incoming: ResearchSource) {
  return current.some(source => source.url === incoming.url && source.id === incoming.id && source.origin === incoming.origin) ? current : [...current, incoming]
}

function App() {
  const spirit = useBookSpirit()
  const { requireAuth, isAuthenticated, isCheckingSession, openAuthModal } = useAuth()
  const [initialItem] = useState(() => loadHistory().find(item => `#chat/${item.id}` === window.location.hash))
  const [view, setView] = useState<AppView>(initialItem?.view || 'home')
  const [libraryRoute, setLibraryRoute] = useState<LibraryRoute | null>(() => parseLibraryRoute(window.location.hash))
  const [question, setQuestion] = useState(initialItem?.question || '')
  const [activeHistoryId, setActiveHistoryId] = useState(initialItem?.id || '')
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)
  const [messages, setMessages] = useState<ChatMessage[]>(initialItem?.messages || [])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [desktopHistoryOpen, setDesktopHistoryOpen] = useState(true)
  const desktop = useMediaQuery('(min-width: 1101px)')
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeDrawer = useCallback(() => setSidebarOpen(false), [])
  useDialogFocus(sidebarOpen, drawerRef, closeDrawer)
  const initialNavigation = useRef(true)
  const routeActions = useRef({ reset: () => {}, select: (_item: HistoryItem) => {} })
  useEffect(() => { setSidebarOpen(false) }, [desktop])
  useEffect(() => {
    const hash = libraryRoute ? libraryHash(libraryRoute) : view === 'home' ? '' : `#chat/${activeHistoryId}`
    if (initialNavigation.current) {
      initialNavigation.current = false
      window.history.replaceState({ fuzhang: true }, '', `${window.location.pathname}${window.location.search}${hash}`)
      return
    }
    if (window.location.hash !== hash) window.history.pushState({ fuzhang: true }, '', `${window.location.pathname}${window.location.search}${hash}`)
    else if (!window.history.state?.fuzhang) window.history.replaceState({ fuzhang: true }, '')
  }, [view, activeHistoryId, libraryRoute])
  useEffect(() => {
    const restore = () => {
      const library = parseLibraryRoute(window.location.hash)
      if (library) { setLibraryRoute(library); setSidebarOpen(false); return }
      const item = loadHistory().find(item => `#chat/${item.id}` === window.location.hash)
      if (item) routeActions.current.select(item)
      else routeActions.current.reset()
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  const [isThinking, setIsThinking] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [research, setResearch] = useState<ResearchResult | undefined>(initialItem?.research)
  const [error, setError] = useState(initialItem?.error || '')
  const streamRunRef = useRef(0)
  const submitQueryRef = useRef(submitQuery)
  submitQueryRef.current = submitQuery
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef<number | undefined>(undefined)
  const scrollTimerRef = useRef<number | undefined>(undefined)
  const lastAutoScrollRef = useRef(0)
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
  const activePhase = latestAssistant?.trace?.slice().reverse().find((step) => step.status === 'active')?.phase
  const companionState = isThinking
    ? latestAssistant?.content ? 'answering'
      : latestAssistant?.route === 'search' || latestAssistant?.route === 'rag' || activePhase === 'search' || activePhase === 'extract'
        ? 'searching' : 'thinking'
    : error ? 'error' : latestAssistant?.content ? research && research.sources.length === 0 ? 'empty' : 'done' : 'idle'

  useEffect(() => { spirit.setPage({ view: libraryRoute ? 'research' : view, topic: libraryRoute ? librarySections.find(section => section.id === libraryRoute.category)!.label : research?.title || question.slice(0, 80) }) }, [view, libraryRoute, research?.title, question, spirit.setPage])
  useEffect(() => { spirit.setMainState(companionState) }, [companionState, spirit.setMainState])
  const reactRef = useRef(spirit.react)
  reactRef.current = spirit.react
  useEffect(() => {
    function onCopy() {
      const selection = window.getSelection()
      const node = selection?.anchorNode
      const element = node instanceof Element ? node : node?.parentElement
      if (element?.closest('.answer-summary, .markdown-body')) reactRef.current('copy')
    }
    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [])
  spirit.clearMainHistory.current = () => { spirit.react('clear', { force: true }); setHistory([]); reset() }

  useEffect(() => {
    saveHistory(history)
  }, [history])

  useEffect(() => {
    if (!isThinking || view !== 'research') return
    const surface = contentScrollRef.current
    if (!surface || scrollFrameRef.current !== undefined || scrollTimerRef.current !== undefined) return

    const elapsed = performance.now() - lastAutoScrollRef.current
    const delay = Math.max(0, 90 - elapsed)
    scrollTimerRef.current = window.setTimeout(() => {
      scrollTimerRef.current = undefined
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = undefined
        const distanceFromBottom = surface.scrollHeight - surface.scrollTop - surface.clientHeight
        if (distanceFromBottom < 220) surface.scrollTop = surface.scrollHeight
        lastAutoScrollRef.current = performance.now()
      })
    }, delay)
  }, [isThinking, messages, view])

  useEffect(() => () => {
    if (scrollTimerRef.current !== undefined) window.clearTimeout(scrollTimerRef.current)
    if (scrollFrameRef.current !== undefined) window.cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  useEffect(() => {
    if (!activeHistoryId || view === 'home' || (isThinking && view === 'research')) return
    setHistory((current) => current
      .map((item) => item.id === activeHistoryId ? {
        ...item,
        question,
        view,
        messages,
        research,
        error,
      } : item)
      .sort((left, right) => right.updatedAt - left.updatedAt))
  }, [activeHistoryId, error, isThinking, messages, question, research, view])

  function changeWebSearch(enabled: boolean) {
    if (!isAuthenticated) { openAuthModal('login'); return }
    setWebSearch(enabled)
    if (enabled) spirit.react('web')
  }
  function reset() {
    streamRunRef.current += 1
    setLibraryRoute(null)
    setView('home')
    setQuestion('')
    setActiveHistoryId('')
    setMessages([])
    setIsThinking(false)
    setWebSearch(false)
    setResearch(undefined)
    setError('')
  }

  function startNew() {
    setSidebarOpen(false)
    reset()
  }

  async function submitQuery(value: string, forceSearch = webSearch, images: ChatImage[] = [], attachments: ChatAttachment[] = []) {
    if (!isAuthenticated) {
      requireAuth(() => void submitQueryRef.current(value, forceSearch, images, attachments))
      return
    }
    const streamRun = ++streamRunRef.current
    const now = Date.now()
    const hour = new Date(now).getHours()
    if (hour >= 22 || hour < 6) spirit.react('late')
    const continuingConversation = Boolean(activeHistoryId) && view === 'research'
    const historyId = continuingConversation ? activeHistoryId : crypto.randomUUID()
    const initialTitle = value.length > 18 ? `${value.slice(0, 18)}…` : value
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: value, createdAt: now, images, attachments }
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt: now, trace: [] }
    const contextMessages = continuingConversation ? [...messages, userMessage] : [userMessage]
    const nextMessages = [...contextMessages, assistantMessage]

    setActiveHistoryId(historyId)
    setMessages(nextMessages)
    if (continuingConversation) setHistory(current => current.map(item => item.id === historyId ? { ...item, updatedAt: now, messages: nextMessages } : item).sort((a, b) => b.updatedAt - a.updatedAt))
    if (!continuingConversation) {
      const historyItem: HistoryItem = {
        id: historyId,
        title: initialTitle,
        question: value,
        createdAt: now,
        updatedAt: now,
        view: 'research',
        messages: nextMessages,
      }
      setHistory((current) => [historyItem, ...current].slice(0, 50))
    }
    setQuestion(value)
    setResearch(undefined)
    setError('')
    setIsThinking(true)
    setView('research')

    let receivedText = ''
    let animationFrame: number | undefined
    try {
      let displayedLength = 0
      let lastFrameAt = performance.now()
      let characterCredit = 0
      let streamEnded = false
      let resolveDrain = () => {}
      const drain = new Promise<void>((resolve) => { resolveDrain = resolve })

      function commitStreamText(text: string) {
        setMessages((current) => current.map((message) => (
          message.id === assistantMessage.id ? { ...message, content: message.content + text } : message
        )))
      }

      function drawStreamFrame(now: number) {
        animationFrame = undefined
        if (streamRunRef.current !== streamRun) {
          resolveDrain()
          return
        }

        const elapsed = Math.min(80, Math.max(0, now - lastFrameAt))
        lastFrameAt = now
        const backlog = receivedText.length - displayedLength
        const charactersPerSecond = streamEnded
          ? Math.min(720, Math.max(180, backlog * 10))
          : backlog > 180 ? 260 : backlog > 70 ? 150 : 78
        characterCredit += charactersPerSecond * elapsed / 1000
        const characterCount = Math.min(backlog, Math.floor(characterCredit))

        if (characterCount > 0) {
          characterCredit -= characterCount
          const nextLength = displayedLength + characterCount
          commitStreamText(receivedText.slice(displayedLength, nextLength))
          displayedLength = nextLength
        }

        if (streamEnded && displayedLength >= receivedText.length) {
          resolveDrain()
          return
        }
        if (displayedLength < receivedText.length) startStreamAnimation()
      }

      function startStreamAnimation() {
        if (animationFrame !== undefined) return
        lastFrameAt = performance.now()
        animationFrame = window.requestAnimationFrame(drawStreamFrame)
      }

      function appendStreamText(text: string) {
        if (!text || streamRunRef.current !== streamRun) return
        const isFirstVisibleChunk = receivedText.length === 0
        receivedText += text
        if (isFirstVisibleChunk && displayedLength === 0) {
          const firstLength = Math.min(2, receivedText.length)
          commitStreamText(receivedText.slice(0, firstLength))
          displayedLength = firstLength
        }
        startStreamAnimation()
      }

      const result = await streamHanfu(contextMessages, {
        onDelta: appendStreamText,
        onStatus: ({ phase, label, detail, route }) => {
          setMessages((current) => current.map((message) => (
            message.id === assistantMessage.id ? {
              ...message,
              title: label,
              route: route || message.route,
              trace: (() => {
                const previous = (message.trace || []).map((step) => (
                  step.status === 'active' ? { ...step, status: 'done' as const } : step
                ))
                const last = previous.at(-1)
                if (last?.phase === phase && last.label === label && last.detail === detail) {
                  return previous.map((step, index) => index === previous.length - 1
                    ? { ...step, status: 'active' as const }
                    : step)
                }
                const nextStep: ProcessTraceStep = {
                  id: crypto.randomUUID(),
                  phase,
                  label,
                  detail,
                  status: phase === 'complete' ? 'done' : 'active',
                  createdAt: Date.now(),
                }
                return [...previous, nextStep].slice(-24)
              })(),
            } : message
          )))
        },
        onSource: (source) => {
          if (streamRunRef.current !== streamRun) return
          setMessages((current) => current.map((message) => (
            message.id === assistantMessage.id
              ? { ...message, sources: addRankedSource(message.sources || [], source) }
              : message
          )))
        },
      }, { forceSearch })
      if (!receivedText && result.answer) appendStreamText(result.answer)
      streamEnded = true
      if (displayedLength >= receivedText.length) resolveDrain()
      else startStreamAnimation()
      await drain
      if (streamRunRef.current !== streamRun) return
      spirit.recordRead()
      spirit.react('done', { force: true })
      setResearch(result)
      setMessages((current) => current.map((message) => (
        message.id === assistantMessage.id
          ? {
              ...message,
              content: result.answer,
              title: result.title,
              sources: result.sources,
              citationWarning: result.citationWarning,
              durationMs: Date.now() - now,
              trace: (message.trace || []).map((step) => (
                step.status === 'active' ? { ...step, status: 'done' as const } : step
              )),
            }
          : message
      )))
      if (!continuingConversation) {
        setHistory((current) => current.map((item) => item.id === historyId ? { ...item, title: item.titleEdited ? item.title : result.title } : item))
      }
      setView('research')
    } catch (reason) {
      if (streamRunRef.current !== streamRun) return
      streamRunRef.current += 1
      const message = reason instanceof Error ? reason.message : '模型请求失败'
      setError(message)
      setMessages((current) => current.map((item) => (
        item.id === assistantMessage.id ? {
          ...item,
          content: receivedText || item.content || `请求失败：${message}`,
          durationMs: Date.now() - now,
          trace: [
            ...(item.trace || []).map((step) => step.status === 'active' ? { ...step, status: 'done' as const } : step),
            {
              id: crypto.randomUUID(),
              phase: 'error' as const,
              label: '处理未完成',
              detail: message,
              status: 'error' as const,
              createdAt: Date.now(),
            },
          ],
        } : item
      )))
      setView('research')
      setIsThinking(false)
    } finally {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame)
      if (streamRunRef.current === streamRun) setIsThinking(false)
    }
  }

  function selectHistory(item: HistoryItem) {
    if (!isAuthenticated) { openAuthModal('login'); return }
    setLibraryRoute(null)
    spirit.controller.interact('flip', performance.now(), spirit.preferences.temperament)
    spirit.react('history')
    streamRunRef.current += 1
    setActiveHistoryId(item.id)
    setMessages(item.messages)
    setQuestion(item.question)
    setResearch(item.research)
    setError(item.error || '')
    setIsThinking(false)
    setView('research')
    setSidebarOpen(false)
  }

  routeActions.current = { reset, select: selectHistory }
  function renameHistory(id: string, title: string) {
    const trimmed = title.trim().slice(0, 80)
    if (trimmed) setHistory(current => current.map(item => item.id === id ? { ...item, title: trimmed, titleEdited: true } : item))
  }

  useEffect(() => {
    if (isAuthenticated || isCheckingSession) return
    if (window.location.hash || view !== 'home') openAuthModal('login')
    reset()
    setSidebarOpen(false)
    spirit.setChatOpen(false)
    spirit.setSettingsOpen(false)
  }, [isAuthenticated, isCheckingSession])

  if (libraryRoute && isAuthenticated) return <KnowledgeLibrary route={libraryRoute} onNavigate={setLibraryRoute} onHome={startNew} />

  if (view === 'home' || !isAuthenticated) {
    return (
      <main className="start-screen">
        <button className="start-brand" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开历史对话">
          <BrandLogo />
          <small>历史对话</small>
        </button>
        <section className="welcome-center" aria-label="开始探索服章">
          <h1 className="welcome-wordmark" aria-label="FuuZhang · 服章">
            <svg viewBox="104 155 1981 437" aria-hidden="true" focusable="false">
              <image href={fuuZhangWordmark} width="2172" height="724" />
            </svg>
          </h1>
          <Composer onSubmit={submitQuery} webSearch={webSearch} onWebSearchChange={changeWebSearch} variant="start" />
          <nav className="welcome-library" aria-label="浏览知识库">
            {librarySections.map(section => <a key={section.id} aria-label={section.label} href={libraryHash({ category: section.id })} onClick={event => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault(); setLibraryRoute({ category: section.id })
            }}><span className="library-button-face">{section.label}</span></a>)}
          </nav>
        </section>
        <p className="welcome-beta-note">
          <span>这是服章测试版本</span>
          <span lang="en">Welcome to FuuZhang</span>
        </p>
        {sidebarOpen && isAuthenticated ? (
          <div className="sidebar-drawer-backdrop" role="presentation" onMouseDown={() => setSidebarOpen(false)}>
            <div ref={drawerRef} className="sidebar-drawer" role="dialog" aria-modal="true" aria-label="历史对话" onMouseDown={(event) => event.stopPropagation()}>
              <button className="sidebar-drawer-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭历史对话"><X size={18} /></button>
              <Sidebar activeId={activeHistoryId} history={history} onSelect={selectHistory} onNew={startNew} onRename={renameHistory} />
            </div>
          </div>
        ) : null}
      </main>
    )
  }

  const latestAssistantSources = [...messages].reverse()
    .find((message) => message.role === 'assistant')?.sources || []

  return (
    <div className={`app-shell workspace-enter ${desktop && !desktopHistoryOpen ? 'history-collapsed' : ''}`}>
      <Header onOpenHistory={() => desktop ? setDesktopHistoryOpen(current => !current) : setSidebarOpen(true)} />
      {desktop && desktopHistoryOpen ? <Sidebar activeId={activeHistoryId} history={history} onSelect={selectHistory} onNew={startNew} onRename={renameHistory} /> : null}

      <main className="main-surface">
        <div ref={contentScrollRef} className="content-scroll">
          <ResearchView
            messages={messages}
            result={research}
            error={error}
            streaming={isThinking}
            onSuggestion={(suggestion) => void submitQuery(suggestion)}
          />
        </div>
        <Composer
          onSubmit={submitQuery}
          webSearch={webSearch}
          onWebSearchChange={changeWebSearch}
          disabled={isThinking}
          companionState={companionState}
        />
      </main>

      <Inspector
        sources={retrievedSources(latestAssistantSources.length ? latestAssistantSources : research?.sources || [])}
        suggestions={research?.suggestions}
        streaming={isThinking}
        onSuggestion={(suggestion) => void submitQuery(suggestion)}
      />

      {sidebarOpen && !desktop ? (
        <div className="sidebar-drawer-backdrop" role="presentation" onMouseDown={() => setSidebarOpen(false)}>
          <div ref={drawerRef} className="sidebar-drawer" role="dialog" aria-modal="true" aria-label="历史对话" onMouseDown={(event) => event.stopPropagation()}>
            <button className="sidebar-drawer-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭历史对话"><X size={18} /></button>
            <Sidebar activeId={activeHistoryId} history={history} onSelect={selectHistory} onNew={startNew} onRename={renameHistory} />
          </div>
        </div>
      ) : null}

    </div>
  )
}

export default App
