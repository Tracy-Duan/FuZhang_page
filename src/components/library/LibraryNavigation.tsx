import { useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { libraryHash } from '../../library'
import type { LibraryRoute } from '../../library'
import { paginationItems } from './libraryRoutes'

export type NavigateLibrary = (route: LibraryRoute) => void
export function LibraryLink({ route, onNavigate, children, ...props }: { route: LibraryRoute; onNavigate: NavigateLibrary; children: ReactNode; className?: string; 'aria-current'?: 'page'; 'aria-label'?: string }) {
  function click(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault(); onNavigate(route)
  }
  return <a {...props} href={libraryHash(route)} onClick={click}>{children}</a>
}
export function LibraryPagination({ page, total, route, onNavigate, reading = false }: { page: number; total: number; route: LibraryRoute; onNavigate: NavigateLibrary; reading?: boolean }) {
  const [jump, setJump] = useState('')
  if (total <= 1) return null
  return <nav className="archive-pagination" aria-label={reading ? '摘录分页' : '资料分页'}>
    <div className="archive-page-buttons">
      <button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => onNavigate({ ...route, page: page - 1 })}><ArrowLeft size={15} /></button>
      {paginationItems(page, total).map((value, index) => value === 'gap' ? <span className="archive-page-gap" key={`gap-${index}`}>…</span> : <button type="button" key={value} aria-label={`第${value}页`} aria-current={value === page ? 'page' : undefined} onClick={() => onNavigate({ ...route, page: value })}>{value}</button>)}
      <button type="button" aria-label="下一页" disabled={page >= total} onClick={() => onNavigate({ ...route, page: page + 1 })}><ArrowRight size={15} /></button>
    </div>
    <form onSubmit={event => { event.preventDefault(); const value = Number(jump); if (Number.isSafeInteger(value) && value >= 1 && value <= total) onNavigate({ ...route, page: value }) }}>
      <label>跳至<input aria-label="跳转页码" type="number" min={1} max={total} inputMode="numeric" value={jump} onChange={event => setJump(event.target.value)} required />页</label><button type="submit">前往</button>
    </form>
  </nav>
}
