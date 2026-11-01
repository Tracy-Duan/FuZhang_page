export type PetGesture = 'shake' | 'fling' | 'hold'
export const PET_DRAG_THRESHOLD = 6
export const PET_HOLD_DELAY = 900
export const PET_HOVER_DELAY = 1_200

interface Sample { x: number; y: number; t: number }
interface Axis { direction: number; extreme: number; turns: number[] }

/** Uses accumulated excursions, rather than the distance between browser events. */
export class PetGestureTracker {
  private samples: Sample[] = []
  private origin: Sample = { x: 0, y: 0, t: 0 }
  private axes: Axis[] = []
  private active = false
  private maxDisplacement = 0
  private firedShake = false
  private firedHold = false

  down(x: number, y: number, t: number) {
    this.cancel()
    this.origin = { x, y, t }
    this.samples = [this.origin]
    this.axes = [x, y].map(extreme => ({ direction: 0, extreme, turns: [] }))
    this.active = true
  }

  move(x: number, y: number, t: number): PetGesture | undefined {
    if (!this.active) return
    this.maxDisplacement = Math.max(this.maxDisplacement, Math.hypot(x - this.origin.x, y - this.origin.y))
    this.samples.push({ x, y, t })
    // Retain a predecessor for a velocity window even with sparse input events.
    while (this.samples.length > 2 && this.samples[1].t < t - 160) this.samples.shift()
    for (const [index, value] of [x, y].entries()) {
      const axis = this.axes[index]
      const delta = value - axis.extreme
      if (!axis.direction && Math.abs(delta) >= 14) axis.direction = Math.sign(delta)
      if (axis.direction && delta * axis.direction >= 0) axis.extreme = value
      else if (axis.direction && Math.abs(delta) >= 14) {
        axis.direction = Math.sign(delta)
        axis.extreme = value
        axis.turns.push(t)
      }
      axis.turns = axis.turns.filter(time => t - time <= 800)
    }
    if (!this.firedShake && this.axes.some(axis => axis.turns.length >= 3)) {
      this.firedShake = true
      return 'shake'
    }
  }

  /** Called by a timer: holding still must respond before the button is released. */
  poll(t: number): PetGesture | undefined {
    if (this.active && !this.firedHold && !this.firedShake && this.maxDisplacement < PET_DRAG_THRESHOLD && t - this.origin.t >= PET_HOLD_DELAY) {
      this.firedHold = true
      return 'hold'
    }
  }

  releaseVelocity(t: number) {
    const last = this.samples.at(-1)
    if (!last || t - last.t > 100) return { vx: 0, vy: 0 }
    const cutoff = last.t - 120
    let first = this.samples[0]
    for (const next of this.samples.slice(1)) {
      if (next.t <= cutoff) first = next
      else {
        if (first.t < cutoff && next.t > first.t) {
          const fraction = (cutoff - first.t) / (next.t - first.t)
          first = { x: first.x + (next.x - first.x) * fraction, y: first.y + (next.y - first.y) * fraction, t: cutoff }
        }
        break
      }
    }
    const seconds = Math.max(0.016, (last.t - first.t) / 1000)
    return { vx: (last.x - first.x) / seconds, vy: (last.y - first.y) / seconds }
  }

  up(t: number): PetGesture | undefined {
    if (!this.active) return
    const hold = this.poll(t)
    const velocity = this.releaseVelocity(t)
    const fling = !this.firedShake && !this.firedHold && this.maxDisplacement >= 24 && Math.hypot(velocity.vx, velocity.vy) > 650
    this.cancel()
    return hold || (fling ? 'fling' : undefined)
  }

  cancel() {
    this.active = false
    this.samples = []
    this.axes = []
    this.maxDisplacement = 0
    this.firedShake = false
    this.firedHold = false
  }
}
