export type CompanionState = 'idle' | 'thinking' | 'searching' | 'answering' | 'done' | 'error' | 'empty' | 'inspecting'
export type BookActivity = CompanionState | 'listening'
export type BookPlayAction = 'ruffle' | 'stretch' | 'hop' | 'spin'
export type BookAction = BookActivity | BookPlayAction | 'greet' | 'peek' | 'ribbon' | 'yawn' | 'tap' | 'grumpy' | 'sleeping' | 'waking' | 'source' | 'tucking' | 'walk' | 'flip' | 'returning' | 'celebrate' | 'dangle' | 'falling' | 'landing' | 'shaken' | 'held' | 'held-high' | 'flung' | 'shield' | 'airing' | 'chase' | 'doze' | 'push' | 'sit' | 'catch' | 'wind' | 'watch'
export type BookTheater = 'hopscotch' | 'tower' | 'airing' | 'chase' | 'doze' | 'carry' | 'stairs' | 'flutter' | 'paper-chase' | 'paperplane' | 'tidy' | 'ribbon-play'
export type BookInteraction = BookPlayAction | 'tap' | 'attention' | 'source' | 'waking' | 'tucking' | 'greet' | 'flip' | 'returning' | 'celebrate'
export type BookTemperament = 'quiet' | 'curious' | 'lively'

export const sleepDelay: Record<BookTemperament, number> = { quiet: 45_000, curious: 60_000, lively: 90_000 }
export const isBookBusy = (state: BookActivity) => state === 'thinking' || state === 'searching' || state === 'answering'
const ambientTiming: Record<BookTemperament, { lead: number; gap: number; actions: readonly BookAction[] }> = {
  quiet: { lead: 3_500, gap: 8_500, actions: ['peek', 'wind', 'ribbon', 'catch', 'stretch', 'hop'] },
  curious: { lead: 2_500, gap: 6_000, actions: ['peek', 'ribbon', 'ruffle', 'hop', 'stretch'] },
  lively: { lead: 1_800, gap: 4_500, actions: ['hop', 'ruffle', 'spin', 'ribbon', 'peek', 'stretch'] },
}
const reactionDuration: Partial<Record<BookAction, number>> = { greet: 1_300, peek: 1_700, ruffle: 2_000, ribbon: 2_000, stretch: 2_100, hop: 1_400, spin: 1_650 }

/** Task activity takes priority over playful reactions; all timing stays outside React renders. */
export class BookSpiritController {
  activity: BookActivity = 'idle'
  activitySince: number
  lastInteraction: number
  private reaction: { action: BookAction; since: number; until: number } | undefined
  private clicks: number[] = []
  private lastGrumpy = -Infinity
  private lastGreeting = -Infinity
  private tapCount = 0
  bounceUntil = 0
  night = false
  particleBurstAt = -Infinity
  theaterRequest: { kind: BookTheater; id: number } | undefined
  private pendingCelebration = false
  private pendingReturn = false

  constructor(now: number) { this.activitySince = now; this.lastInteraction = now }

  requestTheater(kind: BookTheater, now: number) { this.lastInteraction = now; this.theaterRequest = { kind, id: now } }

  setActivity(activity: BookActivity, now: number) {
    if (this.activity === activity) return
    this.activity = activity
    this.activitySince = now
    this.lastInteraction = now
    if (isBookBusy(activity) || !['flip', 'returning', 'celebrate'].includes(this.reaction?.action || '')) this.reaction = undefined
    this.clicks = []
  }

  pose(now: number, temperament: BookTemperament, allowAmbient = true): { action: BookAction; since: number } {
    if (this.reaction?.action === 'tucking' && now < this.reaction.until) return { action: 'tucking', since: this.reaction.since }
    if (isBookBusy(this.activity)) return { action: this.activity, since: this.activitySince }
    if ((!this.reaction || now >= this.reaction.until) && (this.pendingCelebration || this.pendingReturn)) {
      const action = this.pendingReturn ? 'returning' : 'celebrate'
      if (this.pendingReturn) this.pendingReturn = false
      else this.pendingCelebration = false
      this.reaction = { action, since: now, until: now + 2200 }; this.particleBurstAt = now
    }
    if (this.reaction && now < this.reaction.until) return { action: this.reaction.action, since: this.reaction.since }
    if (this.activity === 'done' && now - this.activitySince < 1_250) return { action: 'done', since: this.activitySince }
    if (['listening', 'error', 'empty', 'inspecting'].includes(this.activity)) return { action: this.activity, since: this.activitySince }
    const delay = sleepDelay[temperament] * (this.night ? .55 : 1)
    if (now - this.lastInteraction >= delay) return { action: 'sleeping', since: this.lastInteraction + delay }
    if (allowAmbient && now - this.lastInteraction >= delay - 2_400) return { action: 'yawn', since: this.lastInteraction + delay - 2_400 }
    if (this.reaction && now < this.reaction.until + 800) return { action: 'idle', since: this.reaction.until }
    if (allowAmbient) {
      const timing = ambientTiming[temperament]
      const restSince = this.activitySince + (this.activity === 'done' ? 1_250 : 0) + timing.lead
      const age = now - restSince
      if (age >= 0) {
        const cycle = Math.floor(age / timing.gap)
        if (age % timing.gap < 2_200) return { action: timing.actions[cycle % timing.actions.length], since: restSince + cycle * timing.gap }
      }
    }
    return { action: 'idle', since: this.lastInteraction }
  }

  interact(kind: BookInteraction, now: number, temperament: BookTemperament) {
    if (kind === 'celebrate') { this.pendingCelebration = true; return }
    if (kind === 'returning') { this.pendingReturn = true; return }
    const wasSleeping = this.pose(now, temperament).action === 'sleeping'
    this.lastInteraction = now
    if (kind === 'tucking') { this.reaction = { action: 'tucking', since: now, until: now + 300 }; return }
    if (isBookBusy(this.activity)) {
      if (kind === 'tap') this.bounceUntil = now + 240
      return
    }
    if (kind === 'attention' && !wasSleeping) return
    if (kind === 'greet' && now - this.lastGreeting < 7_000 && !wasSleeping) return
    if (kind === 'greet') this.lastGreeting = now
    if ((kind === 'tap' || kind === 'greet') && this.reaction?.action === 'waking' && now - this.reaction.since < 220) return
    let action: BookAction = kind === 'attention' || wasSleeping ? 'waking' : kind
    if (kind === 'tap' && !wasSleeping) {
      action = (['tap', 'hop', 'peek'] as const)[this.tapCount++ % 3]
      this.clicks = [...this.clicks.filter((time) => now - time < 900), now]
      if (this.clicks.length >= 3 && now - this.lastGrumpy > 8_000) {
        action = 'grumpy'
        this.lastGrumpy = now
        this.clicks = []
      }
    }
    const duration = reactionDuration[action] || (action === 'flip' ? 1800 : action === 'source' ? 1_500 : action === 'grumpy' ? 1_400 : 650)
    this.reaction = { action, since: now, until: now + duration }
  }
}
