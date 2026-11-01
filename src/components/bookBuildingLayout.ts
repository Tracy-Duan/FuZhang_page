import type { SandboxRect } from './bookSpiritSandbox'

/** Visible UI hit areas, used by books only; these are not walls for the pet. */
export function bookControls(): SandboxRect[] {
  const result: SandboxRect[] = [], styles = new WeakMap<Element, CSSStyleDeclaration>()
  const style = (el: Element) => { let s = styles.get(el);if (!s) { s = getComputedStyle(el);styles.set(el, s) }return s }
  for (const el of document.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [role="button"], .companion-chat, .building-menu')) {
    if (el.closest('.book-reader, .dialog-backdrop, .auth-backdrop')) continue
    if (el.closest('.pet-stage') && !el.closest('.building-tools')) continue
    if (el.closest('.companion-chat') && !el.matches('.companion-chat')) continue
    if (!el.getClientRects().length || style(el).visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom)
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = style(p), b = p.getBoundingClientRect()
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left);right = Math.min(right, b.right) }
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top);bottom = Math.min(bottom, b.bottom) }
    }
    if (right <= left || bottom <= top) continue
    result.push({ id: el.matches('.settings-launcher') ? 'ui-settings' : `ui-${result.length}`, x: left - 6, y: top - 6, width: right - left + 12, height: bottom - top + 12 })
  }
  return result
}
