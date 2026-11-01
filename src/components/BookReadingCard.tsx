import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LibraryBook } from './bookLibrary'

export function BookReadingCard({ book, onClose, trigger }: { book: LibraryBook; onClose: () => void; trigger: HTMLElement | null }) {
  const root = useRef<HTMLDialogElement>(null), close = useRef(onClose)
  close.current = onClose
  const [page, setPage] = useState(0)
  const passage = book.passages[page]
  useEffect(() => {
    const dialog = root.current!, previous = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    const hidden = () => { if (document.hidden) close.current() }
    document.addEventListener('visibilitychange', hidden)
    return () => { dialog.close();document.body.style.overflow = overflow;document.removeEventListener('visibilitychange', hidden);if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [trigger])
  return createPortal(<dialog ref={root} className="book-reader" aria-modal="true" aria-labelledby="book-reader-title" aria-describedby="book-reader-meta"
    onKeyDown={e => {
      if (e.key !== 'Tab') return
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')].filter(el => el.getClientRects().length)
      const first = items[0], last = items.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault();last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault();first?.focus() }
    }}
    onCancel={e => { e.preventDefault();onClose() }} onClick={e => {
      if (e.target !== e.currentTarget) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose()
    }}>
    <article style={{ '--book-accent': book.cover } as React.CSSProperties}>
      <header className="book-reader-header"><span>书间偶拾</span><button autoFocus type="button" aria-label="合上古籍" onClick={onClose}>×</button></header>
      <div className="book-reader-heading"><span className="book-reader-seal" aria-hidden="true">卷</span><div><h2 id="book-reader-title">{book.title}</h2><p id="book-reader-meta">{book.author}<span> / </span>{book.theme}</p></div></div>
      <section className="book-reader-page" aria-live="polite" aria-atomic="true"><p className="book-reader-chapter">{passage.chapter}</p><blockquote>{passage.text}</blockquote></section>
      <div className="book-reader-pagination"><button type="button" aria-label="上一片段" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← 上一页</button><span>{String(page + 1).padStart(2, '0')} / {String(book.passages.length).padStart(2, '0')}</span><button type="button" aria-label="下一片段" disabled={page === book.passages.length - 1} onClick={() => setPage(p => p + 1)}>再翻一页 →</button></div>
      <footer><a href={passage.source} target="_blank" rel="noopener noreferrer">{passage.source.includes('ctext.org') ? '中国哲学书电子化计划' : '维基文库'} · 查看原文 ↗</a><p>古籍原文节选，保留繁体，标点依所链电子文本。<br />书本外观为像素化设计，非馆藏版本复刻。</p></footer>
    </article>
  </dialog>, document.body)
}
