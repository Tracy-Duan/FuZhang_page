import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BookSandbox } from './bookSpiritSandbox'
import { paintBuildingBook } from './bookSpiritGround'
import { writeLocal } from './bookSpiritStore'
import { BOOK_LIBRARY, libraryBook } from './bookLibrary'
import type { LibraryBook } from './bookLibrary'
import { BookTapSequence } from './bookTapSequence'
import { BookReadingCard } from './BookReadingCard'
import { bookControls } from './bookBuildingLayout'

export const BOOK_BUILD_KEY = 'fuzhang.book-spirit.build.v1'

export function BookBuilding({ world, onInteract, onReadingChange, isolated = false, storageKey }: { isolated?: boolean; storageKey?: string; world: BookSandbox; onInteract: () => void; onReadingChange: (open: boolean) => void }) {
  const [building, setBuilding] = useState(isolated), [status, setStatus] = useState('')
  const [reading, setReading] = useState<LibraryBook | null>(null)
  const readingOpen = useRef(false), readingTrigger = useRef<HTMLElement | null>(null), suppressClick = useRef(0)
  const root = useRef<HTMLDivElement>(null), active = useRef<(() => void) | null>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const arrangeFrame = useRef(0)
  const mode = useRef(building);mode.current = building
  function save() { const layout = world.commit();if (!world.workspace) writeLocal(storageKey || (isolated ? `${BOOK_BUILD_KEY}.mobile` : BOOK_BUILD_KEY), layout) }
  function arrange(reset = false) {
    onInteract();active.current?.();taps.reset();setBuilding(isolated)
    cancelAnimationFrame(arrangeFrame.current)
    // Close the menu first so its buttons don't displace the default corner pile.
    arrangeFrame.current = requestAnimationFrame(() => {
      world.resize(world.width, world.height, world.input, isolated ? world.controls : bookControls())
      world.arrange(reset);save()
      setStatus(world.workspace ? '书已整理到左下角。' : '书与阿箬已回到右下角。')
      toggle.current?.focus({ preventScroll: true })
    })
  }
  function invite(id: string) {
    onInteract()
    setStatus(world.requestBook(id) ? '她落稳后，会试着找路过去。' : '这本暂时够不到，试着添一级台阶。')
  }
  function read(id: string) {
    const book = libraryBook(id);if (!book) return
    onInteract();active.current?.();taps.reset();readingOpen.current = true
    readingTrigger.current = root.current?.querySelector(`[data-book-id="${id}"]`) || null
    setReading(book);onReadingChange(true)
  }
  function closeReading() { setReading(null);readingOpen.current = false;onReadingChange(false) }
  const handlers = useRef({ invite, read });handlers.current = { invite, read }
  const [taps] = useState(() => new BookTapSequence(id => handlers.current.invite(id), id => handlers.current.read(id)))
  function start(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0 || active.current || readingOpen.current || (innerWidth < 700 && !mode.current)) return
    const book = world.books.find(b => b.id === id);if (!book) return
    onInteract()
    const node = event.currentTarget, x = event.clientX, y = event.clientY, startX = book.x, startY = book.y
    let last = performance.now(), moved = false
    node.setPointerCapture(event.pointerId)
    function move(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      const dx = e.clientX - x, dy = e.clientY - y
      if (!moved && Math.hypot(dx, dy) < 4) return
      if (!moved) { taps.reset();world.remember();world.dragging = id }
      moved = true;e.preventDefault()
      const now = performance.now();world.moveBook(id, startX + dx, startY + dy, now - last, e.altKey);last = now
    }
    function finish(e?: PointerEvent) {
      if (e && e.pointerId !== event.pointerId) return
      if (moved) { world.dragging = null;save();suppressClick.current = performance.now() + 400 }
      if (!e || e.type === 'pointercancel') taps.reset()
      window.removeEventListener('pointermove', move);window.removeEventListener('pointerup', finish);window.removeEventListener('pointercancel', finish);window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', hidden);node.removeEventListener('lostpointercapture', cancel)
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
      active.current = null
    }
    const cancel = () => finish(), hidden = () => { if (document.hidden) finish() }
    active.current = cancel
    window.addEventListener('pointermove', move, { passive: false });window.addEventListener('pointerup', finish);window.addEventListener('pointercancel', finish);window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', hidden);node.addEventListener('lostpointercapture', cancel)
  }
  useEffect(() => {
    let raf = 0, revision = -1, last = 0, dragId: string | null = null
    function paint(now: number) {
      raf = requestAnimationFrame(paint)
      if (document.hidden || now - last < 50) return
      last = now
      if (world.notice) { setStatus(world.notice);world.notice = '' }
      if (revision === world.revision && dragId === world.dragging) return
      revision = world.revision;dragId = world.dragging
      for (const book of world.books) {
        const node = root.current?.querySelector<HTMLButtonElement>(`[data-book-id="${book.id}"]`), canvas = node?.querySelector('canvas')
        if (!node || !canvas) continue
        node.hidden = Boolean(book.stowed)
        node.style.width = `${book.width}px`;node.style.height = `${book.height}px`;node.style.transform = `translate3d(${book.x}px, ${book.y}px, 0)`
        node.dataset.dragging = String(world.dragging === book.id)
        if (canvas.width !== book.width || canvas.height !== book.height) {
          canvas.width = book.width;canvas.height = book.height
          const context = canvas.getContext('2d'), identity = libraryBook(book.id)
          if (context && identity) paintBuildingBook(context, book.width, book.height, identity)
        }
      }
    }
    raf = requestAnimationFrame(paint)
    return () => { cancelAnimationFrame(raf);cancelAnimationFrame(arrangeFrame.current);active.current?.();taps.reset();onReadingChange(false) }
  }, [world, taps, onReadingChange])
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape' && mode.current && !readingOpen.current) { active.current?.();taps.reset();setBuilding(isolated);toggle.current?.focus() } }
    const cancel = () => { active.current?.();taps.reset() }
    const hidden = () => { if (document.hidden) cancel() }
    const outside = (e: PointerEvent) => { if (!(e.target instanceof Element) || !e.target.closest('.building-book')) taps.reset() }
    window.addEventListener('keydown', close);window.addEventListener('resize', cancel);window.addEventListener('blur', cancel);document.addEventListener('visibilitychange', hidden);document.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('keydown', close);window.removeEventListener('resize', cancel);window.removeEventListener('blur', cancel);document.removeEventListener('visibilitychange', hidden);document.removeEventListener('pointerdown', outside) }
  }, [taps])
  useEffect(() => { if (!status) return;const timer = window.setTimeout(() => setStatus(''), 5000);return () => clearTimeout(timer) }, [status])
  return <div className="book-building" ref={root} data-building={building}>
    {BOOK_LIBRARY.map((identity, i) => <button type="button" key={identity.id} className="building-book" data-book-id={identity.id} data-binding={identity.binding}
      aria-label={`${identity.title}：双击请阿箬走来，三击读原文`} aria-haspopup="dialog" aria-keyshortcuts="Enter Shift+Enter"
      title={`《${identity.title}》 · 双击请阿箬走来 · 三击读原文 · 拖动摆放`} onPointerDown={e => start(e, identity.id)}
      onClick={e => {
        if (readingOpen.current || performance.now() < suppressClick.current) return
        if (!e.detail) { taps.reset();read(identity.id);return }
        taps.tap(identity.id, e.clientX, e.clientY, performance.now())
      }} onKeyDown={e => {
        const book = world.books[i];if (!book) return
        if (e.key === 'Enter') { e.preventDefault();taps.reset();if (e.shiftKey) invite(book.id);else read(book.id);return }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || innerWidth < 700 && !building) return
        e.preventDefault();taps.reset();onInteract();world.remember()
        const step = e.shiftKey ? 1 : 8
        world.moveBook(book.id, book.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0), book.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0), 120, e.altKey);save()
      }}><canvas width={1} height={1} aria-hidden="true" /><span className="building-book-title" aria-hidden="true">{[...identity.title].map((letter, index) => <span key={index}>{letter}</span>)}</span></button>)}
    <div className="building-tools">
      {!building && status ? <p className="building-notice" role="status">{status}</p> : null}
      {building ? <div className="building-menu">
        <p>双击请她走来，三击翻开古籍。</p><small>书可悬空，靠近边缘可吸附；Alt自由摆放。方向键移动，Enter阅读，Shift+Enter请她走来。手机开启搭书后可操作。</small>
        <div><button type="button" onClick={() => { onInteract();if (world.undo()) { save();setStatus('已撤销；再按一次可恢复。') } }}>撤销</button>
          <button type="button" onClick={() => arrange()}>整理回底部</button>
          <button type="button" onClick={() => arrange(true)}>重置搭建</button></div>
        <p className="building-status" role="status">{status || '只有阿箬会下落，书本会留在你放下的位置。'}</p>
      </div> : null}
      <button ref={toggle} type="button" className="building-toggle" aria-label={building ? '结束搭建' : '开始搭建书本'} aria-expanded={building}
        onClick={() => { onInteract();active.current?.();taps.reset();setBuilding(!building) }}>{building ? '完成搭建' : '搭书'}</button>
    </div>
    {reading ? <BookReadingCard key={reading.id} book={reading} onClose={closeReading} trigger={readingTrigger.current} /> : null}
  </div>
}
