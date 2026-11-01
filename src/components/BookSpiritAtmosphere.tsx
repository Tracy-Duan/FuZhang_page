import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBookSpirit } from './bookSpiritStore'

export function BookSpiritAtmosphere() {
  const spirit = useBookSpirit()
  const [quote, setQuote] = useState<{ text: string; cite: string; url: string; left: number; top: number }>()
  useEffect(() => {
    if (spirit.authDock || spirit.page.view !== 'home' || !['idle', 'done'].includes(spirit.mainState) || spirit.chatOpen || spirit.settingsOpen || spirit.quiet || !spirit.animated || !spirit.almanac?.quotes.length) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let timer = 0, hideTimer = 0
    function restart() {
      clearTimeout(timer);clearTimeout(hideTimer);setQuote(undefined)
      if (document.hidden || motion.matches) return
      timer = window.setTimeout(() => {
        const b = spirit.petButton.current?.getBoundingClientRect(), values = spirit.almanac?.quotes
        if (!b || !values?.length || document.hidden || motion.matches) return
        const next = values[Math.floor(Math.random() * values.length)]
        const width = Math.min(250, next.text.length * 11 + 8)
        const left = Math.max(12, Math.min(innerWidth - width - 12, b.right + 4)), top = Math.max(80, b.top - 15)
        setQuote({ ...next, left, top });hideTimer = window.setTimeout(() => setQuote(undefined), 3000)
      }, 30000)
    }
    restart();document.addEventListener('pointerdown', restart, { passive: true });document.addEventListener('keydown', restart);document.addEventListener('visibilitychange', restart);motion.addEventListener('change', restart)
    return () => { clearTimeout(timer);clearTimeout(hideTimer);document.removeEventListener('pointerdown', restart);document.removeEventListener('keydown', restart);document.removeEventListener('visibilitychange', restart);motion.removeEventListener('change', restart) }
  }, [spirit.authDock, spirit.page.view, spirit.mainState, spirit.chatOpen, spirit.settingsOpen, spirit.quiet, spirit.animated, spirit.almanac, spirit.petButton])
  if (!quote || spirit.authDock || spirit.chatOpen || spirit.settingsOpen || spirit.page.view !== 'home') return null
  return createPortal(<p className="spirit-idle-quote" title={`${quote.cite} · 传世原文选段`} style={{ left: quote.left, top: quote.top }}>{quote.text}</p>, document.body)
}
