import type { BookAction } from '../bookSpiritController'

export type AuthSpiritEvent = 'arrive' | 'username' | 'nickname' | 'password' | 'invite' | 'mode' | 'submit' | 'error' | 'tap' | 'rest'
const lines: Record<AuthSpiritEvent, string> = {
  arrive: '我先上来，替你扶着这一页。', username: '写下称呼，我看看是哪一位。',
  nickname: '这个称呼，我记在页边。', password: '这行我不看。写好了叫我。',
  invite: '让我看看你的请帖。', mode: '换一页，慢慢填。', submit: '等一等，我翻翻名册。',
  error: '有一处没对上，再看一眼。', tap: '我扶着书页，你慢慢填。', rest: '我就在这儿，不急。',
}

/** Receives field kinds and a normalized gaze only; never accepts form contents. */
export class AuthSpiritDirector {
  phase: AuthSpiritEvent = 'arrive'
  since: number
  private arrivedAt: number
  private modeAt = -Infinity
  private errorAt = -Infinity
  lookX = 0
  changedAt: number

  constructor(now: number) { this.since = now;this.arrivedAt = now;this.changedAt = now }

  react(event: AuthSpiritEvent, now: number) {
    this.phase = event;this.since = now;this.changedAt = now
    if (event === 'mode') this.modeAt = now
    if (event === 'error') this.errorAt = now
    if (event === 'submit' || event === 'mode') this.errorAt = -Infinity
    if (event !== 'username' && event !== 'nickname') this.lookX = 0
    return event !== 'password' && now - this.errorAt < 1500 ? lines.error : lines[event]
  }

  lookAt(value: number, now: number) {
    if (this.phase !== 'username' && this.phase !== 'nickname') return
    this.lookX = Number.isFinite(value) ? Math.max(-2, Math.min(2, value)) : 0
    this.changedAt = now
  }

  pose(now: number): { action: BookAction; since: number } {
    if (this.phase === 'password') return { action: 'shield', since: this.since }
    if (this.phase === 'submit') return { action: 'searching', since: this.since }
    if (now - this.errorAt < 1500) return { action: 'waking', since: this.errorAt }
    if (now - this.arrivedAt < 650) return { action: 'hop', since: this.arrivedAt }
    if (now - this.modeAt < 900) return { action: 'flip', since: this.modeAt }
    const action: BookAction = this.phase === 'username' || this.phase === 'nickname' ? 'listening'
      : this.phase === 'invite' ? 'inspecting' : this.phase === 'tap' && now - this.since < 1300 ? 'greet' : 'idle'
    return { action, since: this.since }
  }
}

export interface AuthSpiritDock {
  target: HTMLDivElement
  origin: { left: number; top: number }
  director: AuthSpiritDirector
  onTap: () => void
}
