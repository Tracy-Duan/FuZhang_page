import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDialogFocus } from './useDialogFocus'

export function MobileBookPanel({ desktop = false, onClose, onTarget }: { desktop?: boolean; onClose: () => void; onTarget: (element: HTMLDivElement | null) => void }) {
  const root = useRef<HTMLElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  useDialogFocus(true, root, onClose)
  useEffect(() => {
    const nodes = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop.current)
    const previous = nodes.map(node => node.inert)
    nodes.forEach(node => { node.inert = true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { nodes.forEach((node, index) => { node.inert = previous[index] }); document.body.style.overflow = overflow }
  }, [])
  return createPortal(<div ref={backdrop} className={`mobile-book-backdrop${desktop ? ' desktop-book-backdrop' : ''}`} onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={root} className="mobile-book-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-book-title">
      <header><div><h2 id="mobile-book-title">和阿箬搭书</h2><p>书与阿箬都在这张卡片里。拖动书本，搭一条小路。</p></div><button type="button" aria-label="关闭搭书" onClick={onClose}><X size={20} /></button></header>
      <div ref={onTarget} className="mobile-book-world" />
    </section>
  </div>, document.body)
}
