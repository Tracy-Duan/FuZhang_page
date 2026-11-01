import { useState } from 'react'
import { ChevronDown, Copy, ExternalLink } from 'lucide-react'
import type { LibraryDetail, LibraryRoute } from '../../library'
import { libraryLayerLabels, libraryStatusLabels } from '../../library'
import { useMediaQuery } from '../useMediaQuery'
import { LibraryPagination, type NavigateLibrary } from './LibraryNavigation'
import { passageLabel } from './libraryRoutes'

export function LibraryReader({ detail, route, onNavigate }: { detail: LibraryDetail; route: LibraryRoute; onNavigate: NavigateLibrary }) {
  const wide = useMediaQuery('(min-width: 900px)')
  const [copied, setCopied] = useState<'idle' | 'done' | 'error'>('idle')
  const { article } = detail
  const citation = [article.cite || article.title, article.url].filter(Boolean).join('\n')
  return <div className="archive-reader-layout">
    <aside className="archive-reference" aria-label="资料信息与摘录导航">
      <details open={wide || undefined} className="archive-reference-info"><summary>资料信息<ChevronDown size={15} /></summary><dl>
        <div><dt>类型</dt><dd>{libraryLayerLabels[article.layer] || article.kind}</dd></div>
        <div><dt>年代</dt><dd className="archive-dynasty">{article.dynasties.join(' / ') || '年代未标注'}</dd></div>
        <div><dt>来源</dt><dd>{article.source || article.cite}</dd></div>
        <div><dt>收录</dt><dd>{detail.total} 则摘录{article.language === 'en' ? ' · 英文原文' : ''}</dd></div>
      </dl>{article.url ? <a className="archive-button" href={article.url} target="_blank" rel="noreferrer">阅读来源页面<ExternalLink size={13} /></a> : null}</details>
      <details open={wide || undefined} className="archive-toc"><summary>本页摘录<ChevronDown size={15} /></summary><nav aria-label="本页摘录">{detail.passages.map((passage, index) => <button type="button" key={passage.id} onClick={() => {
        const target = document.getElementById(`excerpt-${passage.id}`)
        target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        target?.focus({ preventScroll: true })
      }}><span>{String((detail.page - 1) * detail.pageSize + index + 1).padStart(2, '0')}</span>{passageLabel(passage.heading)}</button>)}</nav></details>
    </aside>
    <article className="archive-reading-sheet">
      <header className="archive-article-heading"><p>{libraryLayerLabels[article.layer] || article.kind}<span className="archive-dynasty">{article.dynasties.join(' · ') || '年代未标注'}</span></p><h1>{article.title}</h1>
        {article.originalTitle && article.originalTitle !== article.title ? <p className="archive-original-title">{article.originalTitle}</p> : null}
        <p>{article.source || article.cite} · {detail.total} 则已收录摘录{article.date ? ` · ${article.date}` : ''}</p>
        {article.authors.length ? <p>{article.authors.join(' / ')}</p> : null}
      </header>
      {article.status !== 'verified' ? <aside className="archive-review-scope"><strong>{libraryStatusLabels[article.status]}</strong><p>{article.reviewNote}</p></aside> : null}
      {article.limits ? <aside className="archive-scope">{article.limits}</aside> : null}
      <div className="archive-reader-tools"><span>已收录选段，非来源全文</span><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(citation); setCopied('done') } catch { setCopied('error') } }}><Copy size={14} /><span aria-live="polite">{copied === 'done' ? '已复制出处' : copied === 'error' ? '复制失败，请手动复制' : '复制出处'}</span></button></div>
      {copied === 'error' ? <textarea className="archive-citation-text" readOnly aria-label="出处文本" value={citation} /> : null}
      <div>{detail.passages.map((passage, index) => <section key={passage.id} id={`excerpt-${passage.id}`} tabIndex={-1} className="archive-passage">
        <h2><span>{String((detail.page - 1) * detail.pageSize + index + 1).padStart(2, '0')}</span>{passageLabel(passage.heading)}</h2><p>{passage.text}</p>
        {passage.reviewNote ? <aside className="archive-scope">{passage.reviewNote}</aside> : null}
        <footer>{passage.cite ? <span>{passage.cite}</span> : null}{passage.url ? <a href={passage.url} target="_blank" rel="noreferrer">核对出处<ExternalLink size={13} /></a> : null}</footer>
      </section>)}</div>
      <LibraryPagination key={`${detail.page}:${detail.total}`} page={detail.page} total={Math.ceil(detail.total / detail.pageSize)} route={route} onNavigate={onNavigate} reading />
      <section className="archive-provenance" aria-label="资料出处"><h2>出处与署名</h2><p>{article.attribution || article.cite || article.source}</p>{article.url ? <a href={article.url} target="_blank" rel="noreferrer">阅读来源页面<ExternalLink size={13} /></a> : null}
        {article.license ? <p>原文许可：{article.licenseUrl ? <a href={article.licenseUrl} target="_blank" rel="noreferrer">{article.license}</a> : article.license}</p> : null}
        <p>中文以简体转写展示，可通过出处核对原文。摘录之间独立展示，不代表来源全文。</p>
      </section>
    </article>
  </div>
}
