import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBookSpirit } from './bookSpiritStore'

/** A short, transient line beside the pet. Archived lines also reach the chat. */
export function PetSpeech() {
  const spirit = useBookSpirit()
  const note = spirit.reaction
  const bubble = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    if (!note || spirit.chatOpen || spirit.authDock) return
    const node = bubble.current
    if (!node) return
    let frame = 0, last = -Infinity
    function place(now: number) {
      if (document.hidden || now - last < 50) return
      const bounds = spirit.petButton.current?.getBoundingClientRect()
      if (!bounds || !node) return
      const left = Math.max(12, Math.min(innerWidth - node.offsetWidth - 12, bounds.left + bounds.width / 2 - node.offsetWidth / 2))
      let top = bounds.top - node.offsetHeight - 10
      if (top < 12) top = bounds.bottom + 8
      node.style.left = `${left}px`
      node.style.top = `${Math.max(12, Math.min(innerHeight - node.offsetHeight - 12, top))}px`
      node.style.visibility = 'visible'
      last = performance.now()
    }
    function follow(now: number) { place(now);frame = requestAnimationFrame(follow) }
    place(performance.now());frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [note, spirit.chatOpen, spirit.authDock, spirit.petButton])

  if (!note || spirit.chatOpen || spirit.authDock) return null
  return createPortal(
    <p ref={bubble} className="pet-speech" style={{ visibility: 'hidden' }} data-reaction={note.kind} role="status">{note.text}</p>,
    document.body,
  )
}
