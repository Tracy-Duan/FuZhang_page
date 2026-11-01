import { memo, useCallback, useEffect, useRef } from 'react'
import { BookSpiritStage } from './BookSpiritStage'
import { isBookBusy } from './bookSpiritController'
import type { CompanionState } from './bookSpiritController'
import type { BookInputGaze } from './useBookInputGaze'
import { useBookSpirit } from './bookSpiritStore'
import { useAuth } from './auth'

export type { CompanionState } from './bookSpiritController'
export const PixelCompanion = memo(function PixelCompanion({ state, hasImage = false, inputActive = false, inputGaze }: {
  state: CompanionState; hasImage?: boolean; inputActive?: boolean; inputGaze: React.RefObject<BookInputGaze>; onFocusInput: () => void
}) {
  const spirit = useBookSpirit()
  const { isAuthenticated, openAuthModal } = useAuth()
  const closeChatForPanel = useCallback(() => spirit.setChatOpen(false), [spirit.setChatOpen])
  const stageRef = useRef<HTMLDivElement>(null)
  const metrics = useRef({ x: 8, width: 600 })
  const reactRef = useRef(spirit.react)
  reactRef.current = spirit.react
  const activity = isBookBusy(state) ? state : spirit.chatBusy ? 'searching' : hasImage ? 'inspecting' : inputActive ? 'listening' : state
  useEffect(() => {
    if (!isAuthenticated) return
    const attention = () => spirit.controller.interact('attention', performance.now(), spirit.preferences.temperament)
    const source = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest('a.inline-citation, a.source-item, a.dynamic-source')) { spirit.controller.interact('source', performance.now(), spirit.preferences.temperament); reactRef.current('cite') } }
    document.addEventListener('pointerdown', attention, { passive: true }); document.addEventListener('keydown', attention); document.addEventListener('click', source)
    return () => { document.removeEventListener('pointerdown', attention); document.removeEventListener('keydown', attention); document.removeEventListener('click', source) }
  }, [spirit.controller, spirit.preferences.temperament, isAuthenticated])
  const wasImage = useRef(hasImage)
  useEffect(() => { if (hasImage && !wasImage.current) spirit.react('image'); wasImage.current = hasImage }, [hasImage, spirit.react])
  if (spirit.minimized && !spirit.authDock) return <button className="pet-restore" onClick={() => spirit.setMinimized(false)}>{spirit.preferences.name} · 唤回</button>
  return <BookSpiritStage onBookPanelChange={closeChatForPanel} controller={spirit.controller} activity={activity} preferences={spirit.preferences} inputGaze={inputGaze}
    blocked={!isAuthenticated || isBookBusy(state) || inputActive || hasImage || spirit.chatOpen} quiet={spirit.quiet} motionEnabled={spirit.animated && (isAuthenticated || Boolean(spirit.authDock))} homeView={spirit.page.view === 'home'} season={spirit.almanac?.season}
    authDock={spirit.authDock} stageRef={stageRef} buttonRef={spirit.petButton} metrics={metrics} label={`${spirit.preferences.name || '阿箬'}：${spirit.authDock ? '陪你填写登录信息' : '打开聊天'}`}
    onTap={() => { if (!isAuthenticated) { openAuthModal('login'); return }; spirit.controller.interact('tap', performance.now(), spirit.preferences.temperament); spirit.setChatOpen(!spirit.chatOpen) }}
    onGesture={(kind) => spirit.react(kind)}
    onGreet={() => spirit.controller.interact('greet', performance.now(), spirit.preferences.temperament)} />
})
