import type { BookCover, BookRibbon } from './bookSpiritArt'
import { sampleSpiritProp } from './bookSpiritRoam'
import type { RoamBlock, RoamParticle, RoamProp } from './bookSpiritRoam'
import type { LibraryBook } from './bookLibrary'

const covers: Record<BookCover, readonly [string, string, string, string]> = {
  sage: ['#829578', '#a1b092', '#657b60', '#526150'],
  indigo: ['#7c8e9a', '#a6b6b9', '#5d737f', '#4d626b'],
  tea: ['#a28c6f', '#c1ae8d', '#897354', '#6e604a'],
}
const cream = '#f0e6ce'
const pageLight = '#faf3df'
const ink = '#39483a'
const cinnabar = '#b64e36'

export function paintBuildingBook(c: CanvasRenderingContext2D, w: number, h: number, book: LibraryBook) {
  const fill = (color: string, x: number, y: number, width: number, height: number) => { c.fillStyle = color;c.fillRect(x, y, width, height) }
  const seed = Number(book.id.split('-')[1])
  c.clearRect(0, 0, w, h)
  if (book.binding === 'scroll') {
    fill(book.edge, 0, 3, w, h - 6);fill(book.paper, 6, 3, w - 12, h - 6)
    for (const x of [2, w - 8]) {
      fill(book.edge, x, 0, 6, h);fill(book.cover, x + 1, 2, 4, h - 4)
      fill('#d9c29a', x + 2, 3, 1, h - 6)
    }
    fill(book.accent, w - 19, 2, 3, h - 4)
    fill('#b4a17e', 12, h - 5, w - 33, 1)
  } else {
    fill(book.edge, 0, 1, w - 1, h - 1);fill(book.cover, 1, 0, w - 2, h - 3)
    fill(book.paper, 9, h - 6, w - 13, 4)
    fill('#b9aa8a', 11, h - 4, w - 17, 1)
    if (book.binding === 'accordion') {
      for (let x = 9; x < w - 7; x += 9) { fill(book.edge, x, h - 7, 2, 6);fill(book.paper, x + 2, h - 6, 4, 3) }
      fill(book.edge, 2, 0, 3, h - 1)
    } else if (book.binding === 'wrapped') {
      fill(book.edge, w - 22, 0, 2, h - 2);fill(book.accent, w - 20, 1, 14, h - 8)
      fill(book.paper, w - 17, 5, 5, 2);fill(book.edge, 1, 1, 5, h - 4)
    } else if (book.binding === 'folio') {
      fill(book.edge, 3, 1, 7, h - 4);fill(book.accent, 6, 0, 2, h - 5)
      fill(book.paper, w - 10, 0, 5, 2)
    } else {
      fill(book.edge, 1, 1, 8, h - 3)
      for (const y of [3, Math.floor(h / 2), h - 5]) {
        fill('#d9caaa', 3, y, 11, 1);fill('#d9caaa', 5, y, 1, 3)
      }
    }
    if (seed === 1) { fill(book.accent, w - 18, 2, 4, h - 2);fill(book.paper, w - 17, h - 3, 1, 2) }
    // A few deterministic worn corners, rather than random flickering texture.
    fill(book.paper, 16 + seed * 3, 1, 3, 1);fill(book.edge, w - 5, h - 9, 3, 2)
  }
  const labelX = book.binding === 'scroll' ? 14 : 19
  fill(book.paper, labelX, 3, Math.min(w - labelX - 25, book.title.length * 10 + 8), Math.min(11, h - 7))
}

export function paintGround(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  blocks: RoamBlock[],
  particles: RoamParticle[],
  cover: BookCover,
  now: number,
) {
  context.clearRect(0, 0, width, height)
  const palette = covers[cover] || covers.sage
  for (const block of blocks) {
    if (block.crumbled) continue
    const age = now - block.bornAt
    if (age < 0) continue
    const progress = Math.min(1, age / block.buildMs)
    const eased = 1 - Math.pow(1 - progress, 3)
    const visible = Math.max(3, Math.round(block.height * eased))
    const top = block.top + block.height - visible
    const moving = block.moveTo !== undefined ? Math.max(0, Math.min(1, (now - (block.moveStart || now)) / Math.max(1, (block.moveEnd || now) - (block.moveStart || now)))) : 0
    const x = Math.max(4, Math.min(width - block.width - 4, block.x + ((block.moveTo ?? block.x) - block.x) * moving))
    if (block.kind === 'book') drawBook(context, x, top, block.width, visible, palette, progress)
    else if (block.kind === 'tile') {
      context.fillStyle = block.activeAt !== undefined && now >= block.activeAt ? cinnabar : palette[1]
      context.fillRect(Math.round(x), Math.round(top), block.width, visible)
      context.fillStyle = cream;context.fillRect(Math.round(x) + 3, Math.round(top), block.width - 6, 1)
    } else drawStep(context, x, top, block.width, visible, palette, block.tone, progress, block.id)
  }
  for (const particle of particles) {
    const age = (now - particle.bornAt) / 1_000
    if (age < 0 || age * 1_000 > particle.ttl) continue
    const x = particle.x + particle.vx * age
    const y = particle.y + particle.vy * age + (particle.dust ? 55 : 320) * age * age
    if (y > height + 8) continue
    context.globalAlpha = particle.dust ? .55 * Math.max(0, 1 - age * 1000 / particle.ttl) : 1
    context.fillStyle = particle.dust ? '#ac9876' : particle.tone === 3 ? cream : particle.tone === 2 ? cinnabar : particle.tone === 1 ? palette[1] : palette[2]
    context.fillRect(Math.round(x), Math.round(y), particle.size, particle.size)
  }
  context.globalAlpha = 1
}

/** Draw detached paper and bookmarks on the world canvas, on the same 2px grid as the book. */
export function paintSpiritProps(context: CanvasRenderingContext2D, props: RoamProp[], now: number,
  petX: number, petTop: number, ground: number, ribbon: BookRibbon) {
  const ribbonInk = ribbon === 'ochre' ? '#b08a45' : ribbon === 'plum' ? '#a77a82' : cinnabar
  let visible = 0
  for (const prop of props) {
    const pose = sampleSpiritProp(prop, now)
    if (!pose || pose.alpha <= .01) continue
    visible++
    context.save();context.globalAlpha = pose.alpha
    if (prop.kind === 'ribbon') {
      const startX = petX + 63, startY = petTop + 58
      const controlX = (startX + pose.x) / 2 + Math.sin(pose.angle) * 55
      const controlY = Math.min(ground - 10, Math.max(12, Math.min(startY, pose.y) - 32 + Math.sin(pose.angle * 2) * 45))
      for (let i = 0; i <= 65; i++) {
        const t = i / 65, inv = 1 - t
        const x = inv * inv * startX + 2 * inv * t * controlX + t * t * pose.x
        const y = inv * inv * startY + 2 * inv * t * controlY + t * t * pose.y
        context.fillStyle = ribbonInk;context.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 4, 2)
        if (i % 3 === 0) { context.fillStyle = pageLight;context.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 1, 1) }
      }
      context.restore();continue
    }
    const plane = pose.fold >= .6
    const rows = plane ? 9 : 14, columns = plane ? 18 : 11
    const spread = plane ? 1 : .2 + .8 * Math.abs(Math.cos(pose.turn))
    const cos = Math.cos(pose.angle), sin = Math.sin(pose.angle)
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      if (plane && (Math.abs(y - 4) > (17 - x) * .28 || x < 1)) continue
      const border = plane ? Math.abs(y - 4) > (16 - x) * .22 || x > 14 : x === 0 || y === 0 || x === columns - 1 || y === rows - 1
      let color = border ? '#a79877' : plane && y > 4 ? cream : pageLight
      if (!plane && x > 2 && x < 8 && [4, 7, 10].includes(y) && x !== 7 - prop.seed) color = '#a8ad99'
      if (!plane && x > 6 && x < 9 && y > 9 && y < 12) color = '#bc725a'
      if (plane && y === 4) color = '#a6ac95'
      const localX = (x - columns / 2) * 2 * spread * pose.scale
      const localY = (y - rows / 2) * 2 * pose.scale
      const worldX = pose.x + localX * cos - localY * sin, worldY = pose.y + localX * sin + localY * cos
      context.fillStyle = color;context.fillRect(Math.round(worldX / 2) * 2, Math.round(worldY / 2) * 2, 2, 2)
    }
    context.restore()
  }
  return visible
}

export function paintAtmosphere(context: CanvasRenderingContext2D, width: number, ground: number, now: number, fullPage: boolean) {
  context.save();context.globalAlpha = .16;context.fillStyle = '#a99d82'
  const count = fullPage ? 12 : 4
  for (let i = 0; i < count; i++) {
    const phase = (now / (14000 + i * 730) + i * .17) % 1
    const x = ((i * 137 + phase * 26) % Math.max(1, width - 20)) + 10
    const y = Math.max(12, ground - 30 - i * (fullPage ? 27 : 13) - phase * 22)
    context.fillRect(Math.round(x), Math.round(y), i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1)
  }
  context.restore()
}

function drawStep(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: readonly [string, string, string, string],
  tone: 0 | 1,
  progress: number,
  seed: number,
) {
  const left = Math.round(x)
  const top = Math.round(y)
  const w = Math.round(width)
  const h = Math.max(2, Math.round(height))
  context.fillStyle = ink
  context.fillRect(left, top, w, h)
  context.fillStyle = tone ? palette[1] : palette[0]
  context.fillRect(left + 2, top + 2, w - 4, Math.max(0, h - 4))
  context.fillStyle = palette[1]
  context.fillRect(left + 2, top + 2, w - 4, 2)
  context.fillStyle = palette[2]
  context.fillRect(left + 2, top + h - 2, w - 4, 2)
  if (progress < 0.8) {
    for (let i = 0; i < 3; i += 1) {
      const drift = ((seed * 7 + i * 13) % 17) / 17
      const px = left + 4 + drift * Math.max(1, w - 10)
      const py = top - 4 - (1 - progress) * (12 + ((seed + i * 5) % 9))
      context.fillStyle = i === 0 ? cinnabar : pageLight
      context.fillRect(Math.round(px), Math.round(py), 2, 2)
    }
  }
  if (progress >= 0.85 && h >= 10) {
    context.fillStyle = cream
    context.fillRect(left + 4, top + 4, Math.min(10, w - 8), 2)
    context.fillStyle = cinnabar
    context.fillRect(left + 4, top + 7, 3, 2)
  }
}

function drawBook(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: readonly [string, string, string, string],
  progress: number,
) {
  const left = Math.round(x)
  const top = Math.round(y)
  const w = Math.round(width)
  const h = Math.max(2, Math.round(height))
  context.fillStyle = ink
  context.fillRect(left, top, w, h)
  context.fillStyle = cream
  context.fillRect(left + 2, top + 2, w - 4, Math.max(0, h - 4))
  context.fillStyle = pageLight
  context.fillRect(left + 2, top + 2, w - 4, 2)
  context.fillStyle = palette[1]
  context.fillRect(left + 2, top + h - 3, w - 4, 1)
  if (progress >= 0.85) {
    context.fillStyle = palette[3]
    context.fillRect(left + 2, top + 2, 3, h - 4)
    context.fillStyle = cinnabar
    context.fillRect(left + w - 10, top + 2, 3, h - 4)
  }
}
