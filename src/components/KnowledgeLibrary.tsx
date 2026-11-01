import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { authenticatedFetch } from './auth/session'
import { BrandLogo } from './BrandLogo'
import { libraryHash, librarySections } from '../library'
import type { LibraryDetail, LibraryList, LibraryRoute } from '../library'
import { LibraryLink } from './library/LibraryNavigation'
import { LibraryCatalog } from './library/LibraryCatalog'
import { LibraryReader } from './library/LibraryReader'
import { returnToResults } from './library/libraryRoutes'
import './library/library.css'

interface Props { route: LibraryRoute; onNavigate: (route: LibraryRoute) => void; onHome: () => void }
export function KnowledgeLibrary({ route, onNavigate, onHome }: Props) {
  const section = librarySections.find(item => item.id === route.category)!
  const requestKey = libraryHash(route)
  const [responseState, setResponseState] = useState<{ key: string; data: LibraryList | LibraryDetail } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const scroll = useRef<HTMLElement>(null)
  const positions = useRef(new Map<string, number>())
  const cache = useRef(new Map<string, LibraryList | LibraryDetail>())
  const data = responseState?.key === requestKey ? responseState.data : null
  const error = failure?.key === requestKey ? failure.message : ''
  const { category, articleId, dynasty = '', page = 1, query = '', status } = route
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ category, page: String(page) })
    if (articleId) params.set('id', articleId)
    if (query) params.set('q', query)
    if (dynasty) params.set('dynasty', dynasty)
    if (status) params.set('status', status)
    async function load() {
      try {
        let result = cache.current.get(requestKey)
        if (result) await Promise.resolve()
        else {
          const response = await authenticatedFetch(`/api/knowledge?${params}`, { signal: controller.signal })
          result = await response.json()
          if (!response.ok) throw new Error((result as unknown as { error?: string }).error || '资料暂时无法读取')
        }
        if (!controller.signal.aborted && result) {
          cache.current.set(requestKey, result)
          if (cache.current.size > 12) cache.current.delete(cache.current.keys().next().value!)
          setResponseState({ key: requestKey, data: result })
        }
      } catch (reason) {
        if (!controller.signal.aborted) setFailure({ key: requestKey, message: reason instanceof Error ? reason.message : '资料暂时无法读取' })
      }
    }
    void load()
    return () => controller.abort()
  }, [category, articleId, query, dynasty, status, page, attempt, requestKey])
  useLayoutEffect(() => { if (data && scroll.current) scroll.current.scrollTop = positions.current.get(requestKey) || 0 }, [data, requestKey])
  function navigate(next: LibraryRoute) {
    if (data && scroll.current) positions.current.set(requestKey, scroll.current.scrollTop)
    const nextKey = libraryHash(next)
    const returning = Boolean(articleId) && nextKey === libraryHash(returnToResults(route))
    if (!returning && nextKey !== requestKey) positions.current.set(nextKey, 0)
    onNavigate(next)
  }
  const list = data && 'items' in data ? data : null
  const detail = data && 'article' in data ? data : null
  const feedback = error ? <div className="archive-empty" role="alert"><BookOpen size={26} strokeWidth={1.2} /><h2>书页暂时未能展开</h2><p>{error}</p><button className="archive-button" type="button" onClick={() => { setFailure(null); setResponseState(null); cache.current.delete(requestKey); setAttempt(value => value + 1) }}>重新加载</button></div>
    : !data ? <div className="archive-loading" role="status"><span>正在展开书页…</span><div /><div /><div /></div> : null
  return <main className="archive-screen">
    <header className="archive-header"><button className="archive-brand" type="button" onClick={onHome} aria-label="服章，返回欢迎页"><BrandLogo /><span>服章 · 藏书</span></button>
      <nav className="archive-tabs" aria-label="知识栏目">{librarySections.map(item => <LibraryLink key={item.id} route={{ category: item.id }} onNavigate={navigate} aria-current={category === item.id ? 'page' : undefined}>{item.label}</LibraryLink>)}</nav>
      <button className="archive-home" type="button" onClick={onHome} aria-label="返回欢迎页"><ArrowLeft size={16} /><span>回到对话</span></button>
    </header>
    <section className="archive-scroll" ref={scroll} aria-label={`${section.label}资料`} onScroll={event => { if (data) positions.current.set(requestKey, event.currentTarget.scrollTop) }}>
      <div className="archive-content">
        {articleId ? <><div className="archive-breadcrumb"><LibraryLink route={returnToResults(route)} onNavigate={navigate}><ArrowLeft size={15} />返回{section.label}</LibraryLink><span>/</span><span>摘录阅读</span></div>{feedback}{detail ? <LibraryReader key={articleId} detail={detail} route={route} onNavigate={navigate} /> : null}</>
          : <LibraryCatalog key={category} route={route} list={list} onNavigate={navigate}>{feedback}</LibraryCatalog>}
      </div>
    </section>
  </main>
}
