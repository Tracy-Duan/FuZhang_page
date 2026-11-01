import { useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { librarySections, libraryLayerLabels, libraryStatusLabels } from '../../library'
import type { LibraryList, LibraryRoute, LibraryStatus } from '../../library'
import { LibraryLink, LibraryPagination } from './LibraryNavigation'
import type { NavigateLibrary } from './LibraryNavigation'
import { articleRoute } from './libraryRoutes'

function CatalogSearch({ route, onNavigate }: { route: LibraryRoute; onNavigate: NavigateLibrary }) {
  const section = librarySections.find(item => item.id === route.category)!
  const [query, setQuery] = useState(route.query || '')
  return <form className="archive-search" role="search" onSubmit={event => { event.preventDefault(); onNavigate({ ...route, query: query.trim(), page: 1 }) }}>
    <label><Search size={20} strokeWidth={1.6} /><input aria-label={`搜索${section.label}资料`} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索书名、名物或关键词" maxLength={100} type="search" /></label><button type="submit">搜索</button>
  </form>
}
export function LibraryCatalog({ route, list, onNavigate, children }: { route: LibraryRoute; list: LibraryList | null; onNavigate: NavigateLibrary; children?: ReactNode }) {
  const section = librarySections.find(item => item.id === route.category)!
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeCount = Number(Boolean(route.dynasty)) + Number(Boolean(route.status))
  const filtered = Boolean(route.query || activeCount)
  const dynasties = list?.dynasties || (route.dynasty ? [route.dynasty] : [])
  return <>
    <header className="archive-intro"><h1>{section.label}</h1><p className="archive-subtitle">{section.subtitle}</p><p>{section.description}</p></header>
    <CatalogSearch key={`${route.category}:${route.query || ''}`} route={route} onNavigate={onNavigate} />
    <div className="archive-mobile-tools"><button type="button" aria-expanded={filtersOpen} aria-controls="archive-filter-controls" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={16} />筛选{activeCount ? <span>{activeCount}</span> : null}<ChevronDown size={14} /></button><span>{list ? `${list.total.toLocaleString()} 份资料` : '正在查找资料'}</span></div>
    <div className="archive-catalog-layout">
      <aside className="archive-filter-rail" data-open={filtersOpen} aria-label="资料筛选">
        <div id="archive-filter-controls" className="archive-filter-controls">
          <h2>筛选资料</h2>
          <label>朝代<select aria-label="按朝代筛选" value={route.dynasty || ''} onChange={event => onNavigate({ ...route, dynasty: event.target.value, page: 1 })}><option value="">全部朝代</option>{dynasties.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>资料状态<select aria-label="按资料状态筛选" value={route.status || ''} onChange={event => onNavigate({ ...route, status: event.target.value as LibraryStatus || undefined, page: 1 })}><option value="">全部资料</option>{Object.entries(libraryStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="archive-text-button" type="button" disabled={!filtered} onClick={() => onNavigate({ category: route.category })}>清除筛选</button>
        </div>
        <details className="archive-about"><summary>关于本库<ChevronDown size={14} /></summary><p>按来源归集资料，中文以简体展示。已收录选段不代表来源全文。</p>{list ? <p>全库 {list.coverage.totalPassages.toLocaleString()} 则摘录，其中已核对来源 {list.coverage.statusCounts.verified.toLocaleString()} 则，存档待核对 {list.coverage.statusCounts.archived.toLocaleString()} 则，新增待核对 {list.coverage.statusCounts.pending.toLocaleString()} 则。</p> : null}<p>待核对资料仅供浏览，不代表内容已获证实。</p></details>
      </aside>
      <section className="archive-results" aria-label={`${section.label}资料列表`}>
        <div className="archive-results-heading"><h2>{list ? <>{list.total.toLocaleString()}<span>份资料</span></> : '资料目录'}</h2><p>{list ? `${list.passageTotal.toLocaleString()} 则摘录 · ` : ''}按来源归集</p></div>
        {filtered ? <div className="archive-active-filters" aria-label="已选条件">
          {route.query ? <button type="button" aria-label="移除搜索条件" onClick={() => onNavigate({ ...route, query: '', page: 1 })}>关键词：{route.query}<X size={12} /></button> : null}
          {route.dynasty ? <button type="button" aria-label="移除朝代筛选" onClick={() => onNavigate({ ...route, dynasty: '', page: 1 })}>{route.dynasty}<X size={12} /></button> : null}
          {route.status ? <button type="button" aria-label="移除资料状态筛选" onClick={() => onNavigate({ ...route, status: undefined, page: 1 })}>{libraryStatusLabels[route.status]}<X size={12} /></button> : null}
        </div> : null}
        {children}
        {list?.items.length ? <div className="archive-result-list">{list.items.map(item => <LibraryLink className="archive-result" key={item.id} route={articleRoute(route, item.id, list.page)} onNavigate={onNavigate}>
          <div className="archive-result-meta"><span>{libraryLayerLabels[item.layer] || '相关资料'}{item.status !== 'verified' ? <small className="archive-review-label">{libraryStatusLabels[item.status]}</small> : null}</span><span className="archive-dynasty">{item.dynasties.join(' / ') || '年代未标注'}</span></div>
          <h3>{item.title}</h3><p className="archive-result-source">{item.source || libraryLayerLabels[item.layer] || '相关资料'}</p>
          <p className="archive-result-excerpt">{item.excerpt}</p>
          {item.reviewNote ? <p className="archive-result-review">{item.reviewNote}</p> : null}
          <footer><span className="archive-result-tags">{item.tags.slice(0, 4).join(' · ')}</span><span className="archive-result-action">{item.passageCount} 则摘录{item.language === 'en' ? ' · 英文' : ''}<ArrowRight size={15} /></span></footer>
        </LibraryLink>)}</div> : list ? <div className="archive-empty" role="status"><Search size={26} strokeWidth={1.2} /><h3>没有找到符合条件的资料</h3><p>试试缩短关键词，或移除部分筛选条件。</p><button type="button" className="archive-button" onClick={() => onNavigate({ category: route.category })}>查看本栏全部资料</button></div> : null}
        {list ? <><LibraryPagination key={`${list.page}:${list.total}`} page={list.page} total={Math.ceil(list.total / list.pageSize)} route={route} onNavigate={onNavigate} /><p className="archive-results-note">摘录独立展示，引用前可进入资料页核对来源与使用范围。</p></> : null}
      </section>
    </div>
  </>
}
