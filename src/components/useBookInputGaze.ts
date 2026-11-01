import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export interface BookInputGaze {
  active: boolean
  caretX: number
  caretY: number
  fieldWidth: number
  changedAt: number
  composing: boolean
}

export const bookCaretEvent = 'fuzhang:book-caret'

/** Measure the visible caret locally; passing a ref avoids pet renders for each keystroke. */
export function useBookInputGaze(input: RefObject<HTMLInputElement | null>, enabled: boolean) {
  const target = useRef<BookInputGaze>({ active: false, caretX: 0, caretY: 0, fieldWidth: 1, changedAt: -Infinity, composing: false })
  const compositionActive = useRef(false)

  useEffect(() => {
    const field = input.current
    if (!field) return
    const measure = document.createElement('canvas').getContext('2d')
    let frame: number | undefined
    function update() {
      frame = undefined
      if (!field) return
      const active = enabled && document.activeElement === field && !field.disabled
      const current = target.current
      if (!active || !measure) {
        current.active = false
        current.composing = false
        if (document.activeElement !== field) compositionActive.current = false
        field.dispatchEvent(new Event(bookCaretEvent, { bubbles: true }))
        return
      }
      const bounds = field.getBoundingClientRect()
      const style = getComputedStyle(field)
      measure.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const spacing = parseFloat(style.letterSpacing) || 0
      const widthOf = (text: string) => measure.measureText(text).width + Array.from(text).length * spacing
      const start = bounds.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0)
      const end = bounds.right - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(style.paddingRight) || 0)
      const fieldWidth = Math.max(1, end - start)
      const caret = field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd
      const prefix = widthOf(field.value.slice(0, caret ?? field.value.length))
      const unused = Math.max(0, fieldWidth - widthOf(field.value))
      const rightAligned = style.textAlign === 'right' || style.textAlign === 'end'
      const offset = style.textAlign === 'center' ? unused / 2 : rightAligned ? unused : 0
      const visibleX = style.direction === 'rtl' ? end - prefix - field.scrollLeft : start + offset + prefix - field.scrollLeft
      const caretX = Math.max(start, Math.min(end, visibleX))
      const caretY = bounds.top + bounds.height / 2
      if (!current.active || Math.abs(current.caretX - caretX) > .5 || Math.abs(current.caretY - caretY) > .5) current.changedAt = performance.now()
      current.active = true
      current.caretX = caretX
      current.caretY = caretY
      current.fieldWidth = fieldWidth
      current.composing = compositionActive.current
      field.dispatchEvent(new Event(bookCaretEvent, { bubbles: true }))
    }
    function schedule() {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    function composition(event: Event) {
      compositionActive.current = event.type !== 'compositionend'
      target.current.changedAt = performance.now()
      schedule()
    }
    function edit() { target.current.changedAt = performance.now(); schedule() }
    function selection() { if (document.activeElement === field) schedule() }
    const events = ['select', 'keyup', 'click', 'scroll', 'focus', 'blur'] as const
    for (const event of events) field.addEventListener(event, schedule)
    for (const event of ['compositionstart', 'compositionupdate', 'compositionend']) field.addEventListener(event, composition)
    field.addEventListener('input', edit)
    document.addEventListener('selectionchange', selection)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    document.fonts.addEventListener('loadingdone', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(field)
    schedule()
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      for (const event of events) field.removeEventListener(event, schedule)
      for (const event of ['compositionstart', 'compositionupdate', 'compositionend']) field.removeEventListener(event, composition)
      field.removeEventListener('input', edit)
      document.removeEventListener('selectionchange', selection)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      document.fonts.removeEventListener('loadingdone', schedule)
      observer.disconnect()
    }
  }, [enabled, input])
  return target
}
