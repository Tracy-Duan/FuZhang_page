import type { BookAction, BookTheater } from './bookSpiritController'

export const ROAM_MIN_WIDTH = 280
const PET_WIDTH = 96
const GROUND = 8
const WALK_SPEED = 70

export interface RoamStage {
  width: number
  height: number
  fullPage?: boolean
}

export interface RoamBlock {
  id: number
  kind: 'step' | 'book' | 'tile'
  x: number
  top: number
  width: number
  height: number
  bornAt: number
  buildMs: number
  crumbleAt: number
  crumbled: boolean
  tone: 0 | 1
  activeAt?: number
  moveTo?: number
  moveStart?: number
  moveEnd?: number
}

export interface RoamParticle {
  x: number
  y: number
  vx: number
  vy: number
  bornAt: number
  ttl: number
  size: number
  tone: 0 | 1 | 2 | 3
  dust?: boolean
}

export interface PropFrame {
  at: number; x: number; y: number; angle: number; scale: number; alpha: number; turn: number; fold: number
}
export interface RoamProp {
  kind: 'page' | 'ribbon'; bornAt: number; frames: PropFrame[]; seed: number
}
/** World-space props can leave the character's 48px artwork without being clipped. */
export function sampleSpiritProp(prop: RoamProp, now: number): PropFrame | undefined {
  const age = now - prop.bornAt, frames = prop.frames
  if (age < frames[0].at || age > frames[frames.length - 1].at) return
  let index = 1
  while (index < frames.length - 1 && age > frames[index].at) index++
  const from = frames[index - 1], to = frames[index]
  const t = Math.max(0, Math.min(1, (age - from.at) / Math.max(1, to.at - from.at)))
  const eased = t * t * (3 - 2 * t)
  const mix = (a: number, b: number) => a + (b - a) * eased
  return { at: age, x: mix(from.x, to.x), y: mix(from.y, to.y), angle: mix(from.angle, to.angle),
    scale: mix(from.scale, to.scale), alpha: mix(from.alpha, to.alpha), turn: mix(from.turn, to.turn), fold: mix(from.fold, to.fold) }
}

interface Segment {
  start: number
  end: number
  fromX: number
  toX: number
  fromLift: number
  toLift: number
  arc: number
  action: BookAction
}

/**
 * Keeps the book spirit's walking and building outside React.
 * Every route is a short scripted performance: build, climb, hop down, crumble.
 */
export class BookSpiritRoam {
  x = 8
  lift = 0
  facing: 1 | -1 = 1
  action: BookAction = 'idle'
  actionSince = 0
  blocks: RoamBlock[] = []
  particles: RoamParticle[] = []
  props: RoamProp[] = []
  nextRoamAt: number
  private segments: Segment[] = []
  private index = 0
  private baseLift = 0
  private stage: RoamStage = { width: 0, height: 0 }
  private sequence = 0
  theater: BookTheater | 'stroll' = 'stroll'
  private actIndex = Math.floor(Math.random() * 12)

  constructor(now: number) {
    this.actionSince = now
    this.nextRoamAt = now + 20_000 + Math.random() * 20_000
  }

  get acting() {
    return this.segments.length > 0
  }
  setSurface(lift: number) { if (!this.acting) this.baseLift = Math.max(0, lift) }

  burst(now: number, x = this.x + 48, y = this.stage.height - 100 - this.lift) {
    for (let i = 0; i < 24; i++) this.particles.push({ x, y, vx: (Math.random() - .5) * 150, vy: -90 - Math.random() * 120, bornAt: now, ttl: 1600, size: 2 + (i % 2), tone: ([1, 2, 3] as const)[i % 3] })
  }

  interrupt(now: number) { this.abort(now); this.nextRoamAt = now + 20000 }

  clearEffects() { if (this.props.length) this.props = []; if (this.particles.length) this.particles = [] }

  setStage(stage: RoamStage, now: number) {
    const previous = this.stage
    this.stage = stage
    if (previous.width <= 0) return
    if (Math.abs(previous.width - stage.width) > 12 || Math.abs(previous.height - stage.height) > 12) {
      this.abort(now)
      this.x = this.clamp(stage.width, this.x)
    }
  }

  tick(now: number, options: { canRoam: boolean; blocked: boolean }): { acting: boolean; started: boolean } {
    this.spawnCrumbs(now)
    this.blocks = this.blocks.filter((block) => !block.crumbled || now < block.crumbleAt + 1_200)
    this.particles = this.particles.filter((particle) => now < particle.bornAt + particle.ttl)
    this.props = this.props.filter(prop => now <= prop.bornAt + prop.frames[prop.frames.length - 1].at)

    if (options.blocked || !options.canRoam) {
      this.abort(now)
      return { acting: false, started: false }
    }

    if (this.segments.length) {
      const segment = this.segments[this.index]
      const progress = Math.min(1, Math.max(0, (now - segment.start) / Math.max(1, segment.end - segment.start)))
      const arc = segment.arc ? Math.sin(Math.PI * progress) : 0
      this.x = segment.fromX + (segment.toX - segment.fromX) * progress
      this.lift = segment.fromLift + (segment.toLift - segment.fromLift) * progress + arc * segment.arc
      if (Math.abs(segment.toX - segment.fromX) > 2) this.facing = segment.toX > segment.fromX ? 1 : -1
      if (this.action !== segment.action) {
        this.action = segment.action
        this.actionSince = segment.start
      }
      if (now >= segment.end) {
        if (this.index < this.segments.length - 1) {
          this.index += 1
          const next = this.segments[this.index]
          this.action = next.action
          this.actionSince = next.start
        } else {
          this.finish(now)
          return { acting: false, started: false }
        }
      }
      return { acting: true, started: false }
    }

    if (options.canRoam && now >= this.nextRoamAt && this.stage.width >= ROAM_MIN_WIDTH) {
      this.startAct(now)
      return { acting: this.segments.length > 0, started: this.segments.length > 0 }
    }
    return { acting: false, started: false }
  }

  private finish(now: number) {
    this.lift = this.segments.at(-1)?.toLift ?? this.lift
    this.segments = []
    this.index = 0
    this.action = 'idle'
    this.actionSince = now
    this.nextRoamAt = now + 20_000 + Math.random() * 20_000
  }

  private abort(now: number) {
    if (!this.segments.length && !this.blocks.length) return
    // Recall visible sheets once; discard scheduled sheets and dust on interruption.
    if (this.segments.length) {
      this.props = this.props.flatMap(prop => {
        const pose = sampleSpiritProp(prop, now)
        return pose ? [{ ...prop, bornAt: now, frames: [{ ...pose, at: 0 }, { ...pose, at: 260, x: this.x + 48,
          y: this.stage.height - GROUND - 54 - this.lift, scale: .15, alpha: 0 }] }] : []
      })
      this.particles = this.particles.filter(p => p.bornAt <= now)
      for (const p of this.particles) if (p.dust) p.ttl = Math.min(p.ttl, now - p.bornAt + 180)
    }
    this.crumbleAll(now)
    this.segments = []
    this.index = 0
    this.action = 'idle'
    this.actionSince = now
    this.nextRoamAt = now + 20_000
  }

  private crumbleAll(now: number) {
    for (const block of this.blocks) {
      if (!block.crumbled) block.crumbleAt = Math.min(block.crumbleAt, now)
    }
    this.spawnCrumbs(now)
  }

  private clamp(width: number, x: number) {
    return Math.max(6, Math.min(width - PET_WIDTH - 6, x))
  }

  private startAct(now: number) {
    this.blocks = []
    this.segments = []
    this.index = 0
    const acts: BookTheater[] = ['hopscotch', 'tower', 'airing', 'paper-chase', 'doze', 'carry', 'stairs', 'flutter', 'paperplane', 'tidy', 'ribbon-play', 'chase']
    const index = this.actIndex++ % (acts.length + 1)
    if (index === acts.length) { this.theater = 'stroll'; this.buildStroll(now) }
    else this.perform(acts[index], now)
  }

  perform(kind: BookTheater, now: number) {
    this.interrupt(now); this.blocks = []; this.props = []; this.theater = kind
    if (kind === 'stairs') this.buildStairs(now)
    else if (kind === 'tower') this.buildStack(now)
    else if (kind === 'hopscotch') this.buildHopscotch(now)
    else if (kind === 'carry') this.buildCarry(now)
    else if (['airing', 'flutter', 'paper-chase', 'paperplane', 'tidy', 'ribbon-play'].includes(kind)) this.buildPaperPlay(kind, now)
    else {
      const { segments, push } = this.segmentWriter(now)
      if (kind === 'doze') { push(650, this.x, 0, 'sleeping');push(500, this.x, 0, 'doze');push(600, this.x, 0, 'waking');push(1500, this.x, 0, 'peek') }
      else push(3500, this.x, 0, 'chase')
      this.commit(segments, now, 1)
    }
  }

  private buildPaperPlay(kind: BookTheater, now: number) {
    const ground = this.stage.height - GROUND - this.baseLift, start = this.x
    const dir: 1 | -1 = start + 48 < this.stage.width / 2 ? 1 : -1
    const place = (distance: number) => this.clamp(this.stage.width, start + dir * distance)
    const point = (at: number, x: number, y: number, angle = 0, extra: Partial<PropFrame> = {}): PropFrame => ({
      at, x: Math.max(24, Math.min(this.stage.width - 24, x)), y: Math.max(26, Math.min(ground - 22, y)),
      angle, scale: 1, alpha: 1, turn: 0, fold: 0, ...extra,
    })
    const page = (seed: number, frames: PropFrame[]) => this.props.push({ kind: 'page', bornAt: now, seed, frames })
    const center = start + 48, originY = ground - 54
    const { segments, push } = this.segmentWriter(now)
    if (kind === 'airing') {
      push(500, start, 0, 'airing');push(750, start, 0, 'ruffle');push(1200, start, 0, 'sit')
      push(650, place(28), 0, 'catch', 8);push(1050, start, 0, 'airing');push(400, start, 0, 'done')
      for (let i = 0; i < 3; i++) {
        const x = center + dir * (80 + i * 30), out = 500 + i * 150
        page(i, [point(out, center, originY, 0, { scale: .25, alpha: 0 }),
          point(out + 450, x, ground - 115 - i * 15, dir * (.2 + i * .15), { turn: .8 }),
          point(out + 900, x, ground - 24, -.1 + i * .1),
          point(2450, x + (i === 2 ? dir * 35 : 0), i === 2 ? ground - 128 : ground - 24, i === 2 ? .65 * dir : .1),
          point(3150 + i * 130, x, ground - 65 - i * 12, -.3 * dir, { turn: 2 }),
          point(3650 + i * 130, center, originY, 0, { scale: .2, alpha: 0 })])
      }
      this.dust(now + 650, center, originY, 24)
    } else if (kind === 'flutter') {
      push(450, start, 0, 'stretch');push(900, start, 0, 'ruffle');push(600, start, 0, 'waking')
      push(1000, start, 0, 'catch');push(1200, start, 0, 'airing');push(350, start, 0, 'done')
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? -dir : dir, x = center + side * (85 + i * 20)
        page(i, [point(650 + i * 100, center, originY, 0, { scale: .3, alpha: 0 }),
          point(1300 + i * 90, x, ground - 150 - i * 17, side * .9, { turn: 1.4 + i }),
          point(2300 + i * 90, x + side * 25, ground - 90, -side * .4, { turn: 3.5 + i }),
          point(3300 + i * 160, center + side * 45, ground - 90, side * .3, { turn: 5 }),
          point(3800 + i * 160, center, originY, 0, { scale: .2, alpha: 0 })])
      }
      this.dust(now + 750, center, originY, 20)
    } else if (kind === 'paper-chase') {
      const target = place(150)
      push(350, start, 0, 'peek');push(650, start, 0, 'wind');push(500, start, 0, 'watch')
      push(700, place(85), 0, 'walk', 3);push(450, place(125), 0, 'catch', 26)
      push(400, place(125), 0, 'watch');push(700, target, 0, 'catch', 14)
      push(700, target, 0, 'ruffle');push(400, target, 0, 'done')
      page(0, [point(350, center, originY, 0, { scale: .3, alpha: 0 }),
        point(1000, center + dir * 100, ground - 105, dir * .3, { turn: 1 }),
        point(1900, center + dir * 200, ground - 128, -dir * .4, { turn: 2 }),
        point(2550, center + dir * 170, ground - 180, dir * .65, { turn: 3.6 }),
        point(3350, target + 48 + dir * 40, ground - 88, -dir * .3, { turn: 5 }),
        point(3900, target + 48, ground - 70, dir * .2),
        point(4450, target + 48, originY, 0, { scale: .15, alpha: 0 })])
    } else if (kind === 'paperplane') {
      push(650, start, 0, 'airing');push(450, start, 0, 'peek');push(350, start, 0, 'catch')
      push(1700, start, 0, 'watch');push(550, start, 0, 'hop', 14);push(700, start, 0, 'done')
      page(1, [point(200, center + dir * 25, originY, 0, { scale: .65, alpha: 0 }),
        point(900, center + dir * 32, ground - 72, dir === 1 ? 0 : Math.PI, { fold: 1 }),
        point(1650, center + dir * 135, ground - 145, dir === 1 ? -.3 : Math.PI + .3, { fold: 1 }),
        point(2400, center + dir * 250, ground - 185, dir === 1 ? -.1 : Math.PI + .1, { fold: 1 }),
        point(3200, center + dir * 200, ground - 100, dir === 1 ? 2.6 : .5, { fold: 1 }),
        point(3900, center + dir * 45, ground - 85, dir === 1 ? 3.5 : -.4, { fold: 1 }),
        point(4250, center, originY, 0, { fold: 0, scale: .2, alpha: 0 })])
    } else if (kind === 'tidy') {
      const target = place(24)
      push(500, start, 0, 'peek');push(700, target, 0, 'catch');push(900, target, 0, 'ruffle')
      push(600, target, 0, 'stretch');push(600, target, 0, 'sit');push(450, target, 0, 'hop');push(450, target, 0, 'done')
      for (let i = 0; i < 3; i++) page(i, [point(0, center + dir * (75 + i * 30), ground - 24, (i - 1) * .3, { alpha: 0 }),
        point(300, center + dir * (75 + i * 30), ground - 24, (i - 1) * .3),
        point(700 + i * 400, center + dir * (75 + i * 30), ground - 24, (i - 1) * .3),
        point(1100 + i * 400, target + 48 + dir * 34, ground - 85, dir * .2, { turn: 1 }),
        point(1550 + i * 400, target + 48, originY, 0, { scale: .15, alpha: 0 })])
    } else {
      push(500, start, 0, 'ribbon');push(1600, start, 0, 'chase');push(650, start, 0, 'peek')
      push(650, start, 0, 'catch');push(650, start, 0, 'done')
      this.props.push({ kind: 'ribbon', seed: 0, bornAt: now, frames: [
        point(0, start + 75, ground - 18, 0, { alpha: 0 }),
        point(500, center + dir * 115, ground - 95, .5),
        point(1200, center + dir * 85, ground - 160, 1.2),
        point(1900, center - dir * 95, ground - 70, -1),
        point(2600, center + dir * 125, ground - 40, -.4),
        point(3350, center + dir * 65, ground - 70, .3),
        point(3950, start + 75, ground - 18, 0, { alpha: 0 })] })
    }
    this.commit(segments, now, dir)
  }

  private dust(now: number, x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) this.particles.push({ x: x + (Math.random() - .5) * 36, y: y + Math.random() * 18,
      vx: (Math.random() - .5) * 85, vy: -30 - Math.random() * 45, bornAt: now + (i % 3) * 130,
      ttl: 1000 + Math.random() * 450, size: i % 3 === 0 ? 3 : 2, tone: 3, dust: true })
  }

  private segmentWriter(now: number) {
    const segments: Segment[] = []
    let cursor = now
    const push = (duration: number, toX: number, toLift: number, action: BookAction, arc = 0) => {
      const previous = segments[segments.length - 1]
      segments.push({
        start: cursor,
        end: cursor + duration,
        fromX: previous ? previous.toX : this.x,
        toX,
        fromLift: previous ? previous.toLift : this.lift,
        toLift: toLift + this.baseLift,
        arc,
        action,
      })
      cursor += duration
    }
    const walk = (distance: number) => Math.max(260, Math.min(1_500, Math.abs(distance) / WALK_SPEED * 1_000))
    return { segments, push, walk, endAt: () => cursor }
  }

  private commit(segments: Segment[], now: number, facing: 1 | -1) {
    if (!segments.length) return
    this.segments = segments
    this.index = 0
    this.action = segments[0].action
    this.actionSince = now
    this.facing = facing
  }

  private buildStairs(now: number) {
    const stage = this.stage
    const pet = PET_WIDTH
    const edge = 8
    const stepH = stage.fullPage ? Math.max(20, Math.min(110, (stage.height - 130) / 3)) : 13
    const stepW = 42
    const count = 3
    const groundTop = stage.height - GROUND - this.baseLift
    const dir: 1 | -1 = this.x + pet / 2 < stage.width / 2 ? 1 : -1
    const totalWidth = count * stepW
    let left = dir === 1 ? this.x + pet - 26 : this.x - totalWidth + 26
    left = Math.max(edge, Math.min(stage.width - totalWidth - edge, left))
    const columns = Array.from({ length: count }, (_, i) => ({
      x: dir === 1 ? left + i * stepW : left + (count - 1 - i) * stepW,
      height: (i + 1) * stepH,
    }))
    const stands = columns.map((column) => this.clamp(stage.width, column.x + stepW / 2 - pet / 2))
    const approach = this.clamp(stage.width, stands[0] - dir * 26)
    const landing = this.clamp(stage.width, stands[count - 1] + dir * 130)
    const rest = this.clamp(stage.width, landing + dir * (60 + Math.random() * 90))

    const { segments, push, walk } = this.segmentWriter(now)
    push(walk(approach - this.x), approach, 0, 'walk', 4)
    const buildStart = segments[segments.length - 1].end
    push(600, approach, 0, 'idle')
    for (let i = 0; i < count; i += 1) push(330, stands[i], columns[i].height, 'hop', 15)
    const topTime = segments[segments.length - 1].end
    push(900, stands[count - 1], count * stepH, 'idle')
    push(560, landing, 0, 'hop', 30)
    push(walk(rest - landing), rest, 0, 'walk', 4)

    this.blocks = columns.map((column, i) => ({
      id: (this.sequence += 1),
      kind: 'step',
      x: column.x,
      top: groundTop - column.height,
      width: stepW,
      height: stage.fullPage ? 8 : column.height,
      bornAt: buildStart + 40 + i * 110,
      buildMs: 230,
      crumbleAt: topTime + 1_000 + (count - 1 - i) * 110,
      crumbled: false,
      tone: (i % 2) as 0 | 1,
    }))
    this.commit(segments, now, dir)
  }

  private buildStack(now: number) {
    const stage = this.stage
    const pet = PET_WIDTH
    const slabW = 64
    const slabH = stage.fullPage ? 13 : 9
    const count = 3 + Math.floor(Math.random() * 2)
    const groundTop = stage.height - GROUND - this.baseLift
    const dir: 1 | -1 = this.x + pet / 2 < stage.width / 2 ? 1 : -1
    const stackX = Math.max(8, Math.min(stage.width - slabW - 8, this.x + dir * 90))
    const standX = this.clamp(stage.width, stackX + slabW / 2 - pet / 2)
    const landing = this.clamp(stage.width, standX + dir * 124)
    const rest = this.clamp(stage.width, landing + dir * (50 + Math.random() * 80))

    const { segments, push } = this.segmentWriter(now)
    push(360, standX, 0, 'walk', 4)
    const buildStart = segments[segments.length - 1].end
    push(300, standX, 0, 'idle')
    for (let i = 0; i < count; i++) push(220, standX, (i + 1) * slabH, 'hop', 12)
    const topTime = segments[segments.length - 1].end
    push(2_000, standX, count * slabH, 'sit')
    push(440, landing, 0, 'hop', 24)
    push(300, rest, 0, 'walk', 4)

    this.blocks = Array.from({ length: count }, (_, i) => ({
      id: (this.sequence += 1),
      kind: 'book',
      x: stackX,
      top: groundTop - (i + 1) * slabH,
      width: slabW,
      height: slabH,
      bornAt: buildStart + 40 + i * 130,
      buildMs: 240,
      crumbleAt: topTime + 1850 + (count - 1 - i) * 70,
      crumbled: false,
      tone: (i % 2) as 0 | 1,
    }))
    this.commit(segments, now, dir)
  }

  private buildStroll(now: number) {
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const target = this.clamp(this.stage.width, this.x + dir * (120 + Math.random() * 230))
    const { segments, push, walk } = this.segmentWriter(now)
    push(walk(target - this.x), target, 0, 'walk', 4)
    push(620, target, 0, 'idle')
    if (Math.random() < 0.5) {
      const hopTo = this.clamp(this.stage.width, target + dir * 42)
      push(320, hopTo, 0, 'hop', 14)
      push(520, hopTo, 0, 'idle')
    }
    this.commit(segments, now, dir)
  }

  private buildHopscotch(now: number) {
    const dir: 1 | -1 = this.x < this.stage.width / 2 ? 1 : -1
    const base = this.clamp(this.stage.width, this.x + dir * 20), ground = this.stage.height - GROUND - this.baseLift
    const cells = [[0, 0], [34, 0], [34, 18], [68, 0]]
    const { segments, push } = this.segmentWriter(now)
    push(300, base, 0, 'peek')
    this.blocks = cells.map(([offset, lift], i) => ({ id: ++this.sequence, kind: 'tile', x: this.clamp(this.stage.width, base + dir * offset) + 33,
      top: ground - lift - 3, width: 30, height: 4, bornAt: now, buildMs: 180, activeAt: now + 300 + i * 480,
      crumbleAt: now + 730 + i * 480, crumbled: false, tone: (i % 2) as 0 | 1 }))
    for (const [offset, lift] of cells) push(480, this.clamp(this.stage.width, base + dir * offset), lift, 'hop', 20)
    push(650, this.clamp(this.stage.width, base + dir * 105), 0, 'hop', 15)
    push(350, this.clamp(this.stage.width, base + dir * 105), 0, 'idle')
    this.commit(segments, now, dir)
  }

  private buildCarry(now: number) {
    const dir: 1 | -1 = this.x < this.stage.width / 2 ? 1 : -1
    const start = this.x, target = this.clamp(this.stage.width, start + dir * 120), bookX = start + (dir > 0 ? 78 : -22)
    const { segments, push } = this.segmentWriter(now)
    push(350, start, 0, 'peek');push(1700, target, 0, 'push');push(500, target, 0, 'peek');push(600, this.clamp(this.stage.width, target - dir * 35), 0, 'walk')
    this.blocks = [{ id: ++this.sequence, kind: 'book', x: bookX, top: this.stage.height - GROUND - this.baseLift - 14, width: 40, height: 14, bornAt: now, buildMs: 200,
      crumbleAt: now + 2750, crumbled: false, tone: 1, moveTo: bookX + target - start, moveStart: now + 350, moveEnd: now + 2050 }]
    this.commit(segments, now, dir)
  }

  private spawnCrumbs(now: number) {
    for (const block of this.blocks) {
      if (block.crumbled || now < block.crumbleAt) continue
      block.crumbled = true
      const pieces = Math.max(8, Math.round((block.width * block.height) / 60))
      for (let i = 0; i < pieces; i += 1) {
        this.particles.push({
          x: block.x + Math.random() * block.width,
          y: block.top + Math.random() * block.height,
          vx: (Math.random() - 0.5) * 70,
          vy: 10 + Math.random() * 80,
          bornAt: now,
          ttl: 620 + Math.random() * 320,
          size: 2 + Math.round(Math.random() * 2),
          tone: Math.random() < 0.3 ? 2 : Math.random() < 0.5 ? 0 : 1,
        })
      }
    }
  }
}
