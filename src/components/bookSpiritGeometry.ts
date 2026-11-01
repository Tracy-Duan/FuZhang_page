export interface SpiritRect { left: number; top: number; width: number; height: number }
export interface SpiritLayout { width: number; height: number; ground: number; obstacles: SpiritRect[] }
export function overlaps(a: SpiritRect, b: SpiritRect) { return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top }
export function clampSpirit(x: number, lift: number, layout: SpiritLayout) {
  const maxX = Math.max(8, layout.width - 104), maxLift = Math.max(0, layout.ground - 104)
  x = Math.max(8, Math.min(maxX, Number.isFinite(x) ? x : 8)); lift = Math.max(0, Math.min(maxLift, Number.isFinite(lift) ? lift : 0))
  for (const obstacle of layout.obstacles) {
    if (!overlaps({ left: x, top: layout.ground - 96 - lift, width: 96, height: 96 }, obstacle)) continue
    const candidates = [obstacle.left - 104, obstacle.left + obstacle.width + 8].filter(value => value >= 8 && value <= maxX)
    if (candidates.length) x = candidates.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0]
    else lift = Math.max(0, Math.min(maxLift, layout.ground - obstacle.top + 8))
  }
  return { x, lift }
}

export interface SpiritFall { x: number; lift: number; vx: number; velocity: number; last: number }
/** Momentum and gravity share the same collision bounds as dragging and roaming. */
export function advanceSpiritFall(fall: SpiritFall, now: number, layout: SpiritLayout) {
  const delta = Math.min(.05, Math.max(0, (now - fall.last) / 1000))
  fall.last = now
  fall.velocity += 1500 * delta
  const x = fall.x + fall.vx * delta, lift = fall.lift - fall.velocity * delta
  const safe = clampSpirit(x, lift, layout)
  fall.vx = Math.abs(safe.x - x) > .01 ? 0 : fall.vx * Math.exp(-3.5 * delta)
  if (safe.lift < lift && fall.velocity < 0) fall.velocity = 0
  Object.assign(fall, safe)
  return fall.lift <= 0
}
