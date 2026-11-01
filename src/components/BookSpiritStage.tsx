import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MobileBookPanel } from './MobileBookPanel'
import { useMediaQuery } from './useMediaQuery'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject, PointerEvent as ReactPointerEvent } from 'react'
import { paintBookSpirit } from './bookSpiritArt'
import type { BookPreferences } from './bookSpiritArt'
import type { BookAction, BookActivity, BookSpiritController } from './bookSpiritController'
import { paintAtmosphere, paintGround, paintSpiritProps } from './bookSpiritGround'
import { BookSpiritRoam, ROAM_MIN_WIDTH, sampleSpiritProp } from './bookSpiritRoam'
import type { BookInputGaze } from './useBookInputGaze'
import { clampSpirit } from './bookSpiritGeometry'
import { BookSandbox } from './bookSpiritSandbox'
import { BookBuilding, BOOK_BUILD_KEY } from './BookBuilding'
import { bookControls } from './bookBuildingLayout'
import { PET_DRAG_THRESHOLD, PET_HOLD_DELAY, PET_HOVER_DELAY, PetGestureTracker } from './bookSpiritGesture'
import type { ReactionKind } from './companionReactions'
import type { SpiritFall, SpiritLayout } from './bookSpiritGeometry'
import { readLocal, spiritKeys, writeLocal } from './bookSpiritStore'
import type { CompanionAlmanac } from './companionMessages'
import type { AuthSpiritDock } from './auth/authSpirit'
import { useAuth } from './auth'

interface BookSpiritStageProps {
  controller: BookSpiritController; activity: BookActivity; preferences: BookPreferences
  inputGaze: RefObject<BookInputGaze>; blocked: boolean; quiet: boolean; motionEnabled?: boolean; homeView?: boolean
  stageRef: RefObject<HTMLDivElement | null>; buttonRef: RefObject<HTMLButtonElement | null>
  metrics: RefObject<{ x: number; width: number }>; label: string
  onTap: () => void; onGreet: () => void; onGesture: (kind: ReactionKind) => void; children?: ReactNode
  season?: CompanionAlmanac['season']
  authDock?: AuthSpiritDock
  onBookPanelChange?: () => void
}
interface Drag {
  pointer: number; clientX: number; clientY: number; startX: number; startLift: number
  active: boolean; x: number; lift: number; held: boolean; high: boolean
}
interface Homes { home?: { xRatio: number }; workspace?: { xRatio: number } }

/** Canvas motion and pointer physics stay outside React's render cycle. */
export const BookSpiritStage = memo(function BookSpiritStage({ controller, activity, preferences, inputGaze, blocked, quiet,
  motionEnabled = true, homeView = false, stageRef, buttonRef, metrics, label, onTap, onGreet, onGesture, children, season, authDock, onBookPanelChange }: BookSpiritStageProps) {
  const petCanvas = useRef<HTMLCanvasElement>(null), groundCanvas = useRef<HTMLCanvasElement>(null)
  const [roam] = useState(() => new BookSpiritRoam(performance.now()))
  const mobile = useMediaQuery('(max-width: 699px)')
  const { isAuthenticated, openAuthModal } = useAuth()
  const panelMode = mobile || !homeView || !isAuthenticated
  const [booksOpen, setBooksOpen] = useState(false)
  const [sandboxTarget, setSandboxTarget] = useState<HTMLDivElement | null>(null)
  const isolated = panelMode && booksOpen && Boolean(sandboxTarget)
  const [pageWorld] = useState(() => new BookSandbox(readLocal(BOOK_BUILD_KEY, undefined)))
  const [mobileCardWorld] = useState(() => new BookSandbox(readLocal(`${BOOK_BUILD_KEY}.mobile`, undefined)))
  const [desktopCardWorld] = useState(() => new BookSandbox(readLocal(`${BOOK_BUILD_KEY}.desktop`, undefined)))
  const cardWorld = mobile ? mobileCardWorld : desktopCardWorld
  const world = isolated ? cardWorld : pageWorld
  const closeBooks = useCallback(() => { onBookPanelChange?.();setBooksOpen(false) }, [onBookPanelChange])
  useEffect(() => { if ((!panelMode || !isAuthenticated) && booksOpen) closeBooks() }, [panelMode, booksOpen, closeBooks, isAuthenticated])
  const gaze = useRef(0), paused = useRef(false)
  const readerOpen = useRef(false)
  const onReadingChange = useCallback((open: boolean) => { readerOpen.current = open }, [])
  const hoverAnchor = useRef<{ x: number; lift: number } | undefined>(undefined)
  const gesture = useRef(new PetGestureTracker()), hoverTimer = useRef<number | undefined>(undefined)
  const feedback = useRef<{ kind: ReactionKind; since: number; until: number } | undefined>(undefined)
  const resumeX = useRef<number | undefined>(undefined)
  const props = useRef({ blocked, quiet, activity, preferences, motionEnabled, season, onGesture, authDock })
  props.current = { blocked: isolated ? false : blocked, quiet, activity: isolated ? 'idle' : activity, preferences, motionEnabled, season, onGesture, authDock }
  const layout = useRef<SpiritLayout>({ width: 0, height: 144, ground: 144, obstacles: [] })
  const drag = useRef<Drag | null>(null)
  const dragCleanup = useRef<(() => void) | null>(null)
  const fall = useRef<SpiritFall | null>(null)
  const landingAt = useRef(-Infinity), suppressClickUntil = useRef(0)

  function persist(x: number) {
    if (isolated) return
    const homes = readLocal<Homes>(spiritKeys.home, {})
    homes[homeView ? 'home' : 'workspace'] = { xRatio: Math.max(0, Math.min(1, x / Math.max(1, layout.current.width - 96))) }
    writeLocal(spiritKeys.home, homes)
  }
  function respond(kind: ReactionKind) {
    const now = performance.now()
    feedback.current = { kind, since: now, until: now + (kind === 'hover' ? 1500 : 1800) }
    props.current.onGesture(kind)
  }
  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!isAuthenticated && !props.current.authDock) { openAuthModal('login'); return }
    if (props.current.authDock || !event.isPrimary || event.button !== 0 || drag.current) return
    const button = event.currentTarget
    drag.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, startX: roam.x, startLift: roam.lift, active: false, x: roam.x, lift: roam.lift, held: false, high: false }
    gesture.current.down(event.clientX, event.clientY, performance.now())
    window.clearTimeout(hoverTimer.current)
    paused.current = true
    hoverAnchor.current = undefined
    feedback.current = undefined
    roam.interrupt(performance.now())
    fall.current = null
    button.setPointerCapture(event.pointerId)
    const holdTimer = window.setTimeout(() => {
      const d = drag.current
      if (!d) return
      const next = gesture.current.poll(performance.now())
      if (next) { d.held = true; respond(next) }
    }, PET_HOLD_DELAY + 10)

    function move(e: globalThis.PointerEvent) {
      const d = drag.current
      if (!d || d.pointer !== e.pointerId) return
      const dx = e.clientX - d.clientX, dy = e.clientY - d.clientY
      if (!d.active && Math.hypot(dx, dy) >= PET_DRAG_THRESHOLD) d.active = true
      if (d.active) {
        e.preventDefault()
        window.clearTimeout(holdTimer)
        Object.assign(d, clampSpirit(d.startX + dx, d.startLift - dy, layout.current))
        world.grab(d.x, layout.current.ground - 96 - d.lift)
        d.x = world.body.x;d.lift = world.lift
        const maxLift = layout.current.ground - 104
        if (!d.high && maxLift > 8 && d.lift >= Math.min(140, maxLift * .6)) { d.high = true; respond('high') }
      }
      const next = gesture.current.move(e.clientX, e.clientY, performance.now())
      if (next) respond(next)
    }
    function up(e: globalThis.PointerEvent) {
      const d = drag.current
      if (!d || d.pointer !== e.pointerId) return
      finish(e, e.type === 'pointercancel')
    }
    function finish(e?: globalThis.PointerEvent, cancelled = true) {
      const d = drag.current
      if (!d) return
      const now = performance.now()
      const velocity = gesture.current.releaseVelocity(now)
      const released = cancelled ? undefined : gesture.current.up(now)
      gesture.current.cancel()
      drag.current = null
      if (released) respond(released)
      if (d.active || d.held || released || cancelled) suppressClickUntil.current = now + 400
      if (d.active || d.lift > 0) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !props.current.motionEnabled) { world.release();world.settle();roam.x = world.body.x;roam.lift = world.lift;persist(roam.x) }
        else {
          const flung = released === 'fling'
          fall.current = { x: d.x, lift: flung ? Math.max(16, d.lift) : d.lift,
            vx: flung ? Math.max(-1100, Math.min(1100, velocity.vx)) : 0,
            velocity: flung ? Math.max(-1000, Math.min(d.lift < 20 ? -240 : 1000, velocity.vy)) : 0, last: now }
          world.release(fall.current.vx, fall.current.velocity)
          persist(d.x)
        }
      }
      const bounds = button.getBoundingClientRect()
      paused.current = Boolean(e && e.clientX >= bounds.left && e.clientX <= bounds.right && e.clientY >= bounds.top && e.clientY <= bounds.bottom)
      detach()
    }
    const cancel = () => finish()
    const visibility = () => { if (document.hidden) finish() }
    function detach() {
      window.clearTimeout(holdTimer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', visibility)
      button.removeEventListener('lostpointercapture', cancel)
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId)
      dragCleanup.current = null
    }
    dragCleanup.current = () => { gesture.current.cancel(); drag.current = null; detach() }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', visibility)
    button.addEventListener('lostpointercapture', cancel)
  }
  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drag.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    gaze.current = event.clientX - rect.left - rect.width / 2
  }

  useEffect(() => () => { dragCleanup.current?.() }, [])

  useEffect(() => {
    const node = stageRef.current, pet = buttonRef.current, canvas = groundCanvas.current
    const pen = petCanvas.current?.getContext('2d'), groundPen = canvas?.getContext('2d')
    if (!node || !pet || !canvas || !pen || !groundPen) return
    const stageNode: HTMLDivElement = node, petNode: HTMLButtonElement = pet, groundNode: HTMLCanvasElement = canvas
    const petPen: CanvasRenderingContext2D = pen, sceneryPen: CanvasRenderingContext2D = groundPen
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (authDock) {
      resumeX.current = roam.x
      roam.interrupt(performance.now())
      paused.current = false;hoverAnchor.current = undefined;feedback.current = undefined
    }
    let width = 0, height = 0, ground = 144, raf = 0, last = 0, visible = true, initial = true
    let lastActivity: BookActivity | undefined, lastAction: BookAction | undefined, lastBurst = -Infinity, lastInteraction = controller.lastInteraction
    let lookX = 0, lookY = 0, groundDirty = true
    let manualShow = false, lastAtmosphere = false
    let geometry = '', measureFrame = 0
    const scheduleMeasure = () => { if (!measureFrame) measureFrame = requestAnimationFrame(() => { measureFrame = 0;measure() }) }
    function measure() {
      const rect = stageNode.getBoundingClientRect(), composer = isolated ? undefined : document.querySelector('.composer')?.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height))
      if (authDock) {
        petNode.style.transform = 'translate3d(0, 0, 0)'
        petNode.style.setProperty('--auth-from-x', `${authDock.origin.left - rect.left}px`)
        petNode.style.setProperty('--auth-from-y', `${authDock.origin.top - rect.top}px`)
        return
      }
      // The input is a local solid rectangle; only the viewport bottom is the floor.
      ground = height - 8
      stageNode.style.setProperty('--book-tools-bottom', `${Math.max(14, height - (composer?.top ?? height) + 12)}px`)
      const input = composer ? { id: 'input', x: composer.left - 3, y: composer.top - 3, width: composer.width + 6, height: composer.height + 6 } : null
      const controls = isolated ? [{ id: 'card-tools', x: 0, y: 0, width, height: Math.min(160, height * .4) }] : panelMode ? [] : bookControls()
      const nextGeometry = JSON.stringify([width, height, devicePixelRatio, homeView, input, controls])
      if (nextGeometry === geometry) return
      geometry = nextGeometry
      // A draggable phone companion must remain reachable after resize or release.
      // The full-page mobile world has no book route that needs an offscreen passage.
      world.contained = panelMode
      world.resize(width, height, input, controls, isolated ? false : !homeView)
      if (panelMode && !isolated) { world.books.forEach(book => { book.stowed = true });world.cancelRoute();world.revision++ }
      layout.current = { width, height, ground, obstacles: [] }
      if (hoverAnchor.current) Object.assign(hoverAnchor.current, clampSpirit(hoverAnchor.current.x, hoverAnchor.current.lift, layout.current))
      if (drag.current) Object.assign(drag.current, clampSpirit(drag.current.x, drag.current.lift, layout.current))
      const ratio = Math.min(2, devicePixelRatio || 1)
      groundNode.width = Math.round(width * ratio); groundNode.height = Math.round(height * ratio); sceneryPen.setTransform(ratio, 0, 0, ratio, 0, 0)
      roam.setStage({ width, height: ground + 8, fullPage: true }, performance.now())
      if (initial) {
        const saved = readLocal<Homes>(spiritKeys.home, {})[homeView ? 'home' : 'workspace']
        if (!isolated && (saved || !homeView || resumeX.current !== undefined)) {
          const startX = resumeX.current ?? (saved && Number.isFinite(saved.xRatio) ? saved.xRatio * (width - 96) : world.body.x)
          world.grab(startX, world.body.y)
        }
        resumeX.current = undefined
        initial = false
      }
      roam.x = world.body.x;roam.lift = world.lift
      if (fall.current) Object.assign(fall.current, clampSpirit(fall.current.x, fall.current.lift, layout.current))
      petNode.style.transform = `translate3d(${roam.x.toFixed(1)}px, ${(ground - 96 - roam.lift).toFixed(1)}px, 0)`
      groundDirty = true
    }
    function paint(now: number) {
      const current = props.current, reduced = motion.matches || !current.motionEnabled
      if (readerOpen.current && !current.authDock) return
      if (current.authDock) {
        const director = current.authDock.director, pose = director.pose(now)
        lookX = reduced ? director.lookX : lookX + (director.lookX - lookX) * .55
        const reading = pose.action === 'listening' ? { x: lookX, y: 1, energy: Math.max(0, 1 - (now - director.changedAt) / 800), composing: false } : undefined
        paintBookSpirit(petPen, pose.action, now, pose.since, current.preferences, reduced, lookX, false, reading, controller.night, current.season)
        petNode.dataset.action = pose.action;petNode.dataset.authPhase = director.phase
        petNode.dataset.dragEnabled = 'false';petNode.dataset.dragging = 'false';petNode.dataset.gesture = '';petNode.dataset.theater = ''
        petNode.dataset.gaze = lookX.toFixed(2)
        return
      }
      delete petNode.dataset.authPhase;delete petNode.dataset.gaze
      if (current.activity !== lastActivity) { controller.setActivity(current.activity, now); lastActivity = current.activity }
      if (controller.lastInteraction > lastInteraction) { roam.interrupt(now); manualShow = false; lastInteraction = controller.lastInteraction }
      const request = controller.theaterRequest
      if (request && (reduced || (!current.blocked && !drag.current?.active && !fall.current))) {
        controller.theaterRequest = undefined
        if (!reduced) { world.cancelRoute();roam.setSurface(world.lift);roam.perform(request.kind, now); manualShow = true }
      }
      const physical = Boolean(drag.current || fall.current)
      if (!roam.acting && world.body.grounded) roam.setSurface(world.lift)
      const canRoam = (!mobile || isolated) && (manualShow || (!current.quiet && ['idle', 'done'].includes(current.activity))) && !current.blocked && !reduced && !paused.current && !physical && !world.dragging && !world.route.length && (world.body.grounded || roam.acting) && width >= ROAM_MIN_WIDTH
      const decision = roam.tick(now, { canRoam, blocked: current.blocked || (!manualShow && current.quiet) || physical })
      if (reduced) roam.clearEffects()
      if (!decision.acting) manualShow = false
      if (decision.started) {
        if (controller.pose(now, current.preferences.temperament, false).action === 'sleeping') roam.perform('doze', now)
        controller.interact('attention', now, current.preferences.temperament); lastInteraction = controller.lastInteraction
      }
      const base = controller.pose(now, current.preferences.temperament, !reduced && !decision.acting)
      if (controller.particleBurstAt > lastBurst) { lastBurst = controller.particleBurstAt; if (!reduced) roam.burst(now) }
      let action = decision.acting ? roam.action : base.action, since = decision.acting ? roam.actionSince : base.since
      if (action === 'grumpy' && lastAction !== 'grumpy') respond('poke')
      lastAction = action
      world.extra = roam.blocks.filter(b => !b.crumbled && now >= b.bornAt + b.buildMs && now < b.crumbleAt).map(b => ({ id: `theater-${b.id}`, x: b.x, y: b.top, width: b.width, height: b.height }))
      if (drag.current) {
        roam.x = drag.current.x;roam.lift = drag.current.lift
        world.grab(roam.x, ground - 96 - roam.lift)
        if (drag.current.active) { action = 'dangle';since = now - 500 }
      }
      else {
        const landed = world.tick(now, (!mobile || isolated) && !current.blocked && (!current.quiet || world.manualRoute || Boolean(world.pendingGoal)) && !paused.current && !world.dragging && ['idle', 'done'].includes(current.activity), reduced,
          decision.acting ? { x: roam.x, lift: roam.lift, action, since } : undefined)
        roam.x = world.body.x;roam.lift = world.lift
        if (landed) { landingAt.current = now;if (fall.current) persist(roam.x);fall.current = null }
        if (!world.body.grounded && !decision.acting) action = world.body.vy < -30 ? 'hop' : 'falling'
        else if (world.route.length && !decision.acting) action = 'walk'
        if (world.body.grounded && now - landingAt.current < 280 && !reduced) { action = 'landing';since = landingAt.current }
        if (fall.current && world.body.grounded) { fall.current = null;persist(roam.x) }
      }
      const response = feedback.current
      if (response && (now < response.until || (drag.current?.held && response.kind === 'hold')) && action !== 'landing') {
        const reactions: Partial<Record<ReactionKind, BookAction>> = { shake: 'shaken', fling: 'flung', hold: 'held', high: 'held-high', hover: 'peek' }
        const reaction = reactions[response.kind]
        if (reaction && (physical || !['thinking', 'searching', 'answering'].includes(current.activity))) { action = reaction; since = response.since }
      }
      const top = ground - 96 - roam.lift
      petNode.style.transform = `translate3d(${roam.x.toFixed(1)}px, ${top.toFixed(1)}px, 0)`
      petNode.dataset.action = action; petNode.dataset.dragging = String(Boolean(drag.current?.active)); petNode.dataset.dragEnabled = 'true'
      petNode.dataset.theater = decision.acting ? roam.theater : ''
      petNode.dataset.support = world.body.support || '';petNode.dataset.grounded = String(world.body.grounded)
      petNode.dataset.gesture = response && now < response.until ? response.kind : ''
      metrics.current.x = roam.x; metrics.current.width = width
      const following = !decision.acting && !physical && current.activity === 'listening' && inputGaze.current.active
      let targetX = 0, targetY = 0
      if (following) {
        const b = petNode.getBoundingClientRect()
        targetX = Math.max(-2, Math.min(2, (inputGaze.current.caretX - b.left - b.width * .48) / Math.max(1, inputGaze.current.fieldWidth * .32)))
        targetY = Math.max(-1, Math.min(2, (inputGaze.current.caretY - b.top - b.height * .5) / Math.max(1, b.height * .65)))
      }
      lookX = reduced ? targetX : lookX + (targetX - lookX) * .55; lookY = reduced ? targetY : lookY + (targetY - lookY) * .55
      if (Math.abs(lookX) < .05) lookX = 0; if (Math.abs(lookY) < .05) lookY = 0
      const pointerLook = Math.sign(gaze.current) * Math.min(2, Math.abs(gaze.current) / 26)
      const watched = action === 'watch' ? roam.props.map(prop => sampleSpiritProp(prop, now)).find(pose => pose && pose.alpha > .1) : undefined
      const look = watched ? Math.max(-2, Math.min(2, (watched.x - roam.x - 48) / 40)) : decision.acting ? roam.facing * 2 : following ? lookX : Math.abs(lookX) > .1 ? lookX : pointerLook
      const energy = following ? Math.max(0, Math.min(1, 1 - (now - inputGaze.current.changedAt - 700) / 650)) : 0
      const reading = following ? { x: lookX, y: lookY, energy, composing: inputGaze.current.composing } : undefined
      paintBookSpirit(petPen, action, now, since, current.preferences, reduced, look, controller.bounceUntil > now, reading, controller.night, current.season)
      const scenery = roam.blocks.length > 0 || roam.particles.length > 0 || roam.props.length > 0
      const atmosphere = !reduced && !current.quiet
      if (atmosphere !== lastAtmosphere) { groundDirty = true; lastAtmosphere = atmosphere }
      if (scenery || groundDirty || atmosphere) {
        sceneryPen.clearRect(0, 0, width, height); sceneryPen.save(); sceneryPen.beginPath(); sceneryPen.rect(0, 0, width, Math.max(0, ground - 4));
        if (world.input) sceneryPen.rect(world.input.x, world.input.y, world.input.width, world.input.height)
        sceneryPen.clip('evenodd');paintGround(sceneryPen, width, height, roam.blocks, roam.particles, current.preferences.cover, now)
        if (atmosphere) paintAtmosphere(sceneryPen, width, ground, now, true)
        stageNode.dataset.props = String(paintSpiritProps(sceneryPen, roam.props, now, roam.x, top, ground, current.season?.ribbon || current.preferences.ribbon))
        sceneryPen.restore();groundDirty = scenery
      }
    }
    function frame() {
      raf = requestAnimationFrame(frame)
      const now = performance.now()
      if (document.hidden || !visible || now - last < ((props.current.authDock || roam.acting || world.moving || drag.current || fall.current || now - landingAt.current < 300 || (feedback.current && now < feedback.current.until)) ? 50 : 100)) return
      paint(now); last = performance.now()
    }
    const resizeObserver = new ResizeObserver(scheduleMeasure), observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = 0 })
    resizeObserver.observe(stageNode)
    const composer = isolated ? null : document.querySelector('.composer'); if (composer) resizeObserver.observe(composer)
    const dock = isolated ? null : document.querySelector('.composer-dock'); if (dock) resizeObserver.observe(dock)
    observer.observe(stageNode)
    const watched = new Set<Element>()
    const watchControls = () => {
      for (const el of watched) if (!el.isConnected) { resizeObserver.unobserve(el);watched.delete(el) }
      for (const el of document.querySelectorAll('button, a[href], input, textarea, select, .companion-chat, .building-menu')) {
        if (el.closest('.pet-stage') && !el.closest('.building-tools') || el.closest('.book-reader')) continue
        if (!watched.has(el)) { watched.add(el);resizeObserver.observe(el) }
      }
    }
    const changes = new MutationObserver(() => { if (!isolated && !panelMode) watchControls();scheduleMeasure() })
    changes.observe(isolated ? stageNode : document.body, { childList: true, subtree: true })
    if (!isolated && !panelMode) watchControls()
    const visibility = () => { last = 0 }
    window.addEventListener('resize', scheduleMeasure);window.visualViewport?.addEventListener('resize', scheduleMeasure);document.addEventListener('animationend', scheduleMeasure);document.addEventListener('scroll', scheduleMeasure, true);document.addEventListener('visibilitychange', visibility)
    measure();raf = requestAnimationFrame(frame)
    return () => { dragCleanup.current?.();cancelAnimationFrame(raf);cancelAnimationFrame(measureFrame);resizeObserver.disconnect();observer.disconnect();changes.disconnect();window.removeEventListener('resize', scheduleMeasure);window.visualViewport?.removeEventListener('resize', scheduleMeasure);document.removeEventListener('animationend', scheduleMeasure);document.removeEventListener('scroll', scheduleMeasure, true);document.removeEventListener('visibilitychange', visibility);fall.current = null;window.clearTimeout(hoverTimer.current) }
  }, [authDock, buttonRef, controller, homeView, inputGaze, metrics, roam, stageRef, world, isolated, mobile, panelMode])

  const stage = <div className={`pet-stage pixel-companion ${authDock ? 'pet-stage--auth' : isolated ? 'pet-stage--isolated' : 'pet-stage--page'}`} data-motion={motionEnabled} ref={stageRef}>
    <canvas className="pet-ground" ref={groundCanvas} aria-hidden="true" />
    {!authDock && isAuthenticated && (!panelMode || isolated) ? <BookBuilding isolated={isolated} storageKey={isolated ? `${BOOK_BUILD_KEY}.${mobile ? 'mobile' : 'desktop'}` : undefined} world={world} onReadingChange={onReadingChange} onInteract={() => { controller.interact('attention', performance.now(), preferences.temperament);roam.interrupt(performance.now());world.cancelRoute() }} /> : null}
    <button ref={buttonRef} type="button" className="pet-character" aria-label={label} data-drag-enabled={!authDock}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerEnter={event => {
        if (props.current.authDock) return
        paused.current = true
        if (event.pointerType !== 'mouse') return
        if (!drag.current && !fall.current) hoverAnchor.current = { x: roam.x, lift: roam.lift }
        if (!drag.current?.active) onGreet()
        window.clearTimeout(hoverTimer.current)
        if (!drag.current) hoverTimer.current = window.setTimeout(() => { if (!drag.current && !document.hidden) respond('hover') }, PET_HOVER_DELAY)
      }}
      onPointerLeave={() => {
        paused.current = false;gaze.current = 0;window.clearTimeout(hoverTimer.current)
        hoverAnchor.current = undefined
      }} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) paused.current = true }} onBlur={() => { paused.current = false }}
      onClick={event => { if (props.current.authDock) { props.current.authDock.onTap();return } if (event.detail && performance.now() < suppressClickUntil.current) { event.preventDefault();return } onTap() }}>
      <canvas ref={petCanvas} className="book-spirit-canvas" width={48} height={48} aria-hidden="true" />
    </button>{children}
  </div>
  return <><div className="pet-stage-slot" aria-hidden="true" />
    {panelMode && !authDock ? createPortal(<button type="button" className="mobile-book-launcher" aria-haspopup="dialog" aria-expanded={booksOpen} onClick={() => { if (!isAuthenticated) { openAuthModal('login'); return }; onBookPanelChange?.();setBooksOpen(true) }}>搭书</button>, document.body) : null}
    {panelMode && booksOpen && isAuthenticated && !authDock ? <MobileBookPanel desktop={!mobile} onClose={closeBooks} onTarget={setSandboxTarget} /> : null}
    {createPortal(stage, authDock ? authDock.target : isolated && sandboxTarget ? sandboxTarget : document.body)}
  </>
})
