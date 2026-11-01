import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useDialogFocus(open: boolean, root: RefObject<HTMLElement | null>, close: () => void, restore?: RefObject<HTMLElement | null>, trap = true) {
  useEffect(() => {
    if (!open) return
    const previous = restore?.current || (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const element = root.current
    const controls = () => [...(element?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || [])].filter(item => item.getClientRects().length)
    controls()[0]?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      const focusedDialog = event.target instanceof Element ? event.target.closest('dialog, [role="dialog"]') : null
      if (event.key === 'Escape' && focusedDialog && focusedDialog !== element) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key !== 'Tab' || !trap) return
      const items = controls(), first = items[0], last = items.at(-1)
      if (event.shiftKey && (document.activeElement === first || !element?.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !element?.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [open, root, close, restore, trap])
}
