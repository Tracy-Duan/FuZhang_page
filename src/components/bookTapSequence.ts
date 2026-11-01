export const BOOK_TAP_WINDOW = 300
type Schedule = (run: () => void, delay: number) => ReturnType<typeof setTimeout>
/** Delay only the double-tap action; the third tap cancels it before it runs. */
export class BookTapSequence {
  private current?: { id: string; x: number; y: number; at: number; count: number }
  private timer?: ReturnType<typeof setTimeout>
  constructor(private invite: (id: string) => void, private read: (id: string) => void,
    private schedule: Schedule = (run, delay) => setTimeout(run, delay),
    private unschedule: (timer: ReturnType<typeof setTimeout>) => void = timer => clearTimeout(timer)) {}
  reset() { if (this.timer !== undefined) this.unschedule(this.timer);this.timer = undefined;this.current = undefined }
  tap(id: string, x: number, y: number, now: number) {
    const old = this.current
    const count = old && old.id === id && now - old.at <= BOOK_TAP_WINDOW && Math.hypot(x - old.x, y - old.y) <= 10 ? old.count + 1 : 1
    this.reset()
    if (count === 3) { this.read(id);return }
    this.current = { id, x, y, at: now, count }
    this.timer = this.schedule(() => { this.reset();if (count === 2) this.invite(id) }, BOOK_TAP_WINDOW)
  }
}
