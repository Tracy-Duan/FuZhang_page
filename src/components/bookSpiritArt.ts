import { closedBookShapes } from './bookSpiritPixels'
import type { BookColor } from './bookSpiritPixels'
import type { BookAction, BookTemperament } from './bookSpiritController'

export type BookCover = 'sage' | 'indigo' | 'tea'
export type BookRibbon = 'cinnabar' | 'ochre' | 'plum'
export interface BookPreferences { name: string; cover: BookCover; ribbon: BookRibbon; temperament: BookTemperament }
type RGBA = readonly [number, number, number, number]
type Palette = Record<BookColor, RGBA>
const size = 48
export const covers: Record<BookCover, readonly [string, string, string, string]> = {
  sage: ['#829578', '#a1b092', '#657b60', '#526150'],
  indigo: ['#7c8e9a', '#a6b6b9', '#5d737f', '#4d626b'],
  tea: ['#a28c6f', '#c1ae8d', '#897354', '#6e604a'],
}
const ribbons: Record<BookRibbon, readonly [string, string]> = {
  cinnabar: ['#b64e36', '#cf7950'], ochre: ['#aa7b37', '#cba157'], plum: ['#956079', '#b98b9d'],
}
const rgba = (hex: string): RGBA => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]

function makePalette(preferences: BookPreferences): Palette {
  const [sage, sageLight, sageDark, edge] = covers[preferences.cover]
  const [red, redLight] = ribbons[preferences.ribbon]
  return {
    edge: rgba(edge), sage: rgba(sage), sageLight: rgba(sageLight), sageDark: rgba(sageDark), red: rgba(red), redLight: rgba(redLight),
    deep: rgba('#b4a585'), shade: rgba('#cebd9c'), base: rgba('#e5d6b6'), cream: rgba('#f0e6ce'), light: rgba('#faf3df'),
    eye: rgba('#39483a'), shadow: [128, 123, 101, 50],
  }
}

class Pixels {
  data: Uint8ClampedArray<ArrayBuffer>
  constructor(public palette: Palette, data?: Uint8ClampedArray<ArrayBuffer>) { this.data = data ? new Uint8ClampedArray(data) : new Uint8ClampedArray(size * size * 4) }
  dot(color: BookColor, x: number, y: number) {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || y < 0 || x >= size || y >= size) return
    this.data.set(this.palette[color], (y * size + x) * 4)
  }
  rect(color: BookColor, x: number, y: number, width: number, height: number) {
    for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) this.dot(color, column, row)
  }
  poly(color: BookColor, points: readonly number[]) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let inside = false
      for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
        const xi = points[i], yi = points[i + 1], xj = points[j], yj = points[j + 1]
        if (((yi > y + .5) !== (yj > y + .5)) && x + .5 < (xj - xi) * (y + .5 - yi) / (yj - yi) + xi) inside = !inside
      }
      if (inside) this.dot(color, x, y)
    }
  }
}

const closedCache = new Map<string, Uint8ClampedArray<ArrayBuffer>>()
function closedBook(palette: Palette, key: string) {
  let data = closedCache.get(key)
  if (!data) {
    const pixels = new Pixels(palette)
    for (const [kind, color, ...points] of closedBookShapes) {
      if (kind === 'rect') pixels.rect(color, points[0], points[1], points[2], points[3])
      else pixels.poly(color, points)
    }
    data = pixels.data
    closedCache.set(key, data)
  }
  return new Pixels(palette, data)
}

function eyes(pixels: Pixels, open: boolean, leftX: number, leftY: number, rightX: number, rightY: number, gaze: number, vertical = 0) {
  const shift = Math.max(-2, Math.min(2, Math.round(gaze)))
  const down = Math.max(-1, Math.min(2, Math.round(vertical)))
  pixels.rect('eye', leftX + shift, leftY + down + (open ? 0 : 2), 2, open ? 3 : 1)
  pixels.rect('eye', rightX + shift, rightY + down + (open ? 0 : 2), 2, open ? 3 : 1)
  if (open) { pixels.dot('sageDark', leftX + shift, leftY + down); pixels.dot('sageDark', rightX + shift, rightY + down) }
}

function bookmark(pixels: Pixels, wag: number, pointing = false, drooping = false, flourish = 0) {
  if (pointing) {
    pixels.rect('red', 35, 28, 5, 1); pixels.rect('red', 40, 27, 4, 1)
    pixels.rect('red', 43, 25, 1, 5); pixels.dot('redLight', 42, 26)
  } else {
    pixels.rect('red', 36, 30, 2, 1); pixels.rect('red', 37, 31, 1, 5)
    pixels.rect('redLight', 37, 32, 1, 2); pixels.rect('red', 38, 36, 1, 2)
    if (flourish) {
      const lift = flourish % 3
      pixels.rect('red', 39, 35 - lift, 1, 3)
      pixels.rect('red', 40, 33 - lift, 4, 1); pixels.rect('red', 44, 34 - lift, 1, 3)
      pixels.rect('red', 40, 37 - lift, 4, 1); pixels.rect('redLight', 42, 34 - lift, 2, 1)
      pixels.rect('red', 40, 38 - lift, 1, 3); pixels.rect('red', 41, 40 - lift, 4, 1)
      return
    }
    pixels.rect('red', 39, 38, 3, 1)
    pixels.rect('red', 42 + wag, 39, 1, drooping ? 5 : 2)
    pixels.rect('red', 41 + wag, 41, 4, 1); pixels.rect('red', 43 + wag, 40, 2, 1)
    pixels.rect('red', 43 + wag, 42, 1, 2); pixels.dot('red', 42 + wag, 43); pixels.dot('red', 44 + wag, 43)
  }
}

function sparkle(pixels: Pixels, x: number, y: number) {
  pixels.rect('redLight', x - 1, y, 3, 1)
  pixels.rect('redLight', x, y - 1, 1, 3)
}

function openBook(palette: Palette, frame: number, writing: boolean, blink: boolean) {
  const p = new Pixels(palette)
  p.rect('shadow', 6, 40, 36, 2)
  p.poly('edge', [3, 13, 7, 11, 19, 13, 24, 16, 29, 13, 41, 11, 45, 13, 44, 37, 39, 38, 29, 39, 24, 42, 19, 39, 9, 38, 4, 37])
  p.poly('sage', [4, 14, 7, 12, 20, 15, 24, 18, 28, 15, 41, 12, 44, 14, 43, 36, 29, 38, 24, 41, 19, 38, 5, 36])
  p.poly('shade', [6, 13, 19, 15, 24, 18, 29, 15, 42, 13, 41, 35, 29, 37, 24, 40, 19, 37, 7, 35])
  p.poly('cream', [7, 11, 19, 13, 24, 17, 29, 13, 41, 11, 40, 34, 29, 36, 24, 39, 19, 36, 8, 34])
  p.poly('light', [8, 13, 18, 15, 22, 18, 22, 35, 18, 33, 9, 32])
  p.poly('light', [26, 18, 30, 15, 40, 13, 39, 32, 30, 33, 26, 35])
  p.rect('deep', 23, 18, 2, 21)
  p.rect('red', 24, 35, 2, 8); p.dot('redLight', 24, 36)
  if (!writing) {
    // A three-frame page travels across the spine, with a brief hold between turns.
    if (frame === 1) p.poly('cream', [25, 17, 35, 12, 34, 33, 25, 38])
    if (frame === 2) p.poly('base', [22, 17, 16, 12, 17, 33, 22, 38])
    eyes(p, blink, 15, 24, 31, 24, 0)
  } else {
    eyes(p, blink, 15, 21, 31, 21, 0)
    for (let line = 0; line <= frame; line++) {
      p.rect('deep', 11, 29 + line * 2, 8, 1)
      p.rect('deep', 28, 29 + line * 2, line === frame ? 5 : 8, 1)
    }
  }
  return p
}

export function paintBookSpirit(context: CanvasRenderingContext2D, action: BookAction, time: number, since: number,
  preferences: BookPreferences, reducedMotion: boolean, gaze: number, bouncing: boolean,
  inputLook?: { x: number; y: number; energy: number; composing: boolean }, night = false,
  season?: { prop?: 'lantern' | 'zongzi' | 'mooncake' | 'sprig'; ribbon?: BookRibbon }) {
  const palette = makePalette(season?.ribbon ? { ...preferences, ribbon: season.ribbon } : preferences)
  const elapsed = Math.max(0, time - since)
  const speed = preferences.temperament === 'lively' ? .8 : preferences.temperament === 'curious' ? .95 : 1.15
  const tick = reducedMotion ? 0 : Math.floor(time / (180 * speed))
  const beat = reducedMotion ? 0 : Math.floor(elapsed / 140)
  const blink = reducedMotion || (time % ((preferences.temperament === 'lively' ? 4_700 : 6_300) * (night ? 1.5 : 1))) > (night ? 300 : 170)
  const closing = action === 'done' && !reducedMotion && elapsed < 240
  const unfolding = action === 'searching' && !reducedMotion && elapsed < 240
  const ruffling = action === 'ruffle' && (reducedMotion || (elapsed > 180 && elapsed < 1_600))
  const opening = action === 'searching' || action === 'answering' || action === 'flip' || action === 'empty' || action === 'airing' || (action === 'wind' && elapsed < 650) || ruffling
  const writingStep = reducedMotion ? 2 : Math.floor(elapsed / 420) % 8
  const writing = action === 'answering' && writingStep < 5
  const spinFrame = action === 'chase' ? Math.floor(elapsed / 100) % 10 : Math.min(9, Math.floor(elapsed / 160))
  const readingInput = inputLook && (action === 'listening' || action === 'idle') ? inputLook : undefined
  let pixels: Pixels
  if ((opening || closing) && !(unfolding && elapsed < 120)) {
    const frame = action === 'empty' ? 0 : ['flip', 'wind', 'airing'].includes(action) ? reducedMotion ? 0 : Math.floor(elapsed / 90) % 3 : writing ? Math.min(3, writingStep) : ([0, 1, 2, 1, 0] as const)[tick % 5]
    pixels = openBook(palette, frame, writing, blink)
    if (action === 'empty') {
      for (const [y, row] of ['110', '001', '010', '000', '010'].entries()) for (let x = 0; x < 3; x++) if (row[x] === '1') pixels.dot('red', 36 + x, 4 + y)
      pixels.rect('red', 38, 34, 1, 11); pixels.rect('redLight', 39, 43, 1, 2)
    }
    if (!reducedMotion && action === 'searching' && tick % 5 === 2) {
      pixels.rect('light', 10, 8, 9, 1); pixels.rect('shade', 10, 9, 1, 3)
      pixels.rect('cream', 11, 9, 8, 3); pixels.rect('deep', 12, 10, 4, 1)
    }
    if (writing) {
      // A tiny quill follows the decorative lines, then the page turns and starts again.
      const penX = 36 + (writingStep % 2)
      pixels.rect('edge', penX, 21 + Math.min(writingStep, 3) * 2, 1, 7)
      pixels.rect('redLight', penX + 1, 20 + Math.min(writingStep, 3) * 2, 2, 3)
      pixels.dot('red', penX + 2, 19 + Math.min(writingStep, 3) * 2)
    }
  } else {
    pixels = closedBook(palette, `${preferences.cover}:${season?.ribbon || preferences.ribbon}`)
    const asleep = action === 'sleeping'
    const annoyed = action === 'grumpy'
    const backFacing = (annoyed && elapsed < 850) || ((action === 'spin' || (action === 'chase' && elapsed < 1800)) && spinFrame >= 2 && spinFrame <= 5)
    const sleepy = asleep || action === 'shield' || (action === 'yawn' && elapsed > 450 && elapsed < 1_900)
    const wakingBlink = action === 'waking' && elapsed < 220
    const peekLook = beat < 4 ? -1 : beat < 8 ? 1 : 0
    const look = readingInput ? readingInput.x : action === 'listening' ? 0 : action === 'thinking' ? -1 : action === 'peek' ? peekLook : Math.sign(gaze)
    if (backFacing && !reducedMotion) {
      pixels.rect('sageDark', 13, 15, 17, 21)
      pixels.rect('sage', 15, 16, 14, 19)
      pixels.rect('sageLight', 16, 17, 1, 17)
      pixels.rect('sageDark', 24, 29, 1, 5)
      pixels.rect('sageLight', 21, 30, 3, 1); pixels.rect('sageLight', 25, 31, 3, 1)
    } else {
      const happyBlink = (action === 'greet' || action === 'hop' || action === 'done') && beat % 6 === 2
      eyes(pixels, (blink || action === 'inspecting') && !sleepy && !annoyed && !wakingBlink && !happyBlink, 18, 22, 26, 23, look, readingInput?.y || 0)
    }
    const waving = action === 'ribbon' || action === 'chase' || (action === 'greet' && beat > 1 && beat < 7) || (action === 'done' && beat > 2 && beat < 7)
    if (action === 'shield') {
      pixels.rect('red', 16, 21, 16, 2);pixels.rect('redLight', 17, 21, 13, 1)
      pixels.rect('cream', 13, 18, 3, 13);pixels.rect('shade', 12, 20, 1, 11)
    }
    else if (['dangle', 'falling', 'shaken', 'held', 'held-high', 'flung'].includes(action)) { pixels.rect('red', 36, 30, 2, 15); pixels.dot('redLight', 37, 43) }
    else bookmark(pixels, reducedMotion ? 0 : tick % 8 < 3 ? 1 : 0, action === 'source' || action === 'catch' || (action === 'wind' && elapsed > 650 && elapsed < 1500), action === 'error' || asleep || action === 'sit',
      waving && !reducedMotion ? beat % 3 + 1 : 0)
    if (action === 'error') {
      pixels.rect('red', 39, 36, 4, 1); pixels.rect('red', 39, 37, 1, 3); pixels.rect('red', 42, 37, 1, 3); pixels.rect('red', 40, 39, 2, 1)
    }
    if (action === 'inspecting') {
      pixels.rect('sageDark', 38, 28, 3, 3); pixels.dot('cream', 39, 29); pixels.dot('red', 41, 31)
    }
    if (action === 'shaken' || action === 'flung') {
      // Tiny crossed pupils and a loose page make rough handling readable at 48px.
      for (const x of [18, 26]) { pixels.dot('cream', x, 23);pixels.dot('eye', x - 1, 22);pixels.dot('eye', x + 1, 24);pixels.dot('eye', x - 1, 24);pixels.dot('eye', x + 1, 22) }
      pixels.rect('cream', 39, 10, 4, 3);pixels.dot('shade', 42, 12)
    }
    if (action === 'held' || action === 'held-high') { pixels.rect('eye', 22, 27, 2, 2);pixels.dot('cream', 22, 27) }
    if (action === 'returning' && !reducedMotion) { sparkle(pixels, 6, 12); sparkle(pixels, 39, 7) }
    if (asleep) {
      const zX = reducedMotion || tick % 8 < 4 ? 36 : 38
      pixels.rect('sageDark', zX, 12, 4, 1); pixels.dot('sageDark', zX + 2, 13); pixels.rect('sageDark', zX, 14, 4, 1)
    }
    if (action === 'yawn' && !reducedMotion && elapsed > 450 && elapsed < 1_900) {
      pixels.rect('eye', 22, 27, 2, 3); pixels.dot('cream', 22, 27)
    }
    if (action === 'thinking') {
      const markY = reducedMotion ? 11 : tick % 8 < 4 ? 10 : 11
      pixels.rect('red', 38, markY, 3, 1); pixels.rect('red', 40, markY + 1, 1, 2)
      pixels.dot('red', 39, markY + 3); pixels.dot('red', 39, markY + 5)
    }
    if (action === 'stretch' && (reducedMotion || (elapsed > 280 && elapsed < 1_650))) {
      pixels.rect('shade', 4, 20, 3, 12); pixels.rect('cream', 5, 19, 2, 11)
      pixels.rect('light', 4, 19, 1, 10); pixels.rect('cream', 38, 19, 2, 12)
      pixels.rect('shade', 40, 21, 1, 10)
    }
    if (!reducedMotion && action === 'done' && beat > 2 && beat < 7) { sparkle(pixels, 6, 14); sparkle(pixels, 39, 6) }
    if (!reducedMotion && action === 'greet' && beat > 1 && beat < 7) sparkle(pixels, 40, 14)
    if (!reducedMotion && action === 'peek' && beat > 2 && beat < 9) {
      pixels.dot('sageDark', peekLook < 0 ? 4 : 41, 19)
      pixels.dot('sageDark', peekLook < 0 ? 2 : 43, 18)
    }
  }

  if (season?.prop) {
    pixels.rect('sageDark', 36, 27, 5, 1)
    if (season.prop === 'lantern') { pixels.rect('red', 40, 20, 6, 6);pixels.rect('redLight', 41, 21, 4, 4);pixels.rect('deep', 42, 19, 2, 1);pixels.rect('red', 42, 26, 1, 2) }
    if (season.prop === 'zongzi') { pixels.poly('sageDark', [40, 26, 43, 20, 46, 26]);pixels.poly('sageLight', [41, 25, 43, 21, 45, 25]);pixels.rect('cream', 41, 24, 4, 1) }
    if (season.prop === 'mooncake') { pixels.rect('deep', 40, 21, 6, 4);pixels.rect('shade', 41, 20, 4, 6);pixels.rect('cream', 42, 22, 2, 2) }
    if (season.prop === 'sprig') { pixels.rect('sageDark', 43, 20, 1, 6);pixels.rect('sage', 41, 20, 2, 2);pixels.rect('sageLight', 44, 22, 2, 2);pixels.dot('red', 42, 24) }
  }
  let bob = 0, lean = 0, squash = 1, slide = 0
  let spread = (closing && elapsed >= 120) || (unfolding && elapsed >= 120) ? .72 : 1
  if (!reducedMotion) {
    if (action === 'idle') bob = time % 5_500 > 4_200 ? -1 : 0
    if (action === 'inspecting') lean = .05
    if (action === 'watch') lean = Math.sign(gaze) * -.035
    if (action === 'dangle') { squash = .94; lean = Math.sin(time / 150) * .03 }
    if (action === 'shield') { lean = -.065;slide = -1 }
    if (action === 'shaken') { lean = Math.sin(elapsed / 65) * .15;slide = Math.sin(elapsed / 70) * 2;squash = .94 }
    if (action === 'held') { squash = 1.06;lean = Math.sin(elapsed / 220) * .04 }
    if (action === 'held-high') { squash = 1.04;lean = Math.sin(elapsed / 130) * .07 }
    if (action === 'flung') { lean = Math.sin(elapsed / 100) * .16;squash = 1.04 }
    if (action === 'falling') { squash = 1.04; lean = .025 }
    if (action === 'landing') squash = .78 + Math.min(1, elapsed / 260) * .22
    if (action === 'airing') { lean = Math.sin(elapsed / 85) * .025; bob = beat % 3 === 0 ? -1 : 0 }
    if (action === 'chase') { spread = elapsed < 1800 ? ([1, .72, .4, .15, .4, .72, 1, .85, 1, 1] as const)[spinFrame] : 1;lean = elapsed > 1800 ? Math.sin(elapsed / 140) * .14 : 0 }
    if (action === 'doze') { lean = Math.min(.45, elapsed / 1000);squash = .9;bob = 2 }
    if (action === 'push') { lean = gaze >= 0 ? -.1 : .1;bob = tick % 3 ? 0 : -1 }
    if (action === 'sit') { squash = .94;lean = -.06 }
    if (action === 'catch') { lean = elapsed < 900 ? -.09 : .02;bob = elapsed > 300 && elapsed < 650 ? -2 : 0 }
    if (action === 'returning' || action === 'celebrate') {
      const t = elapsed % 850
      bob = t > 180 && t < 600 && elapsed < 1700 ? -Math.sin((t - 180) / 420 * Math.PI) * 5 : 0
      squash = t > 600 && t < 720 ? .87 : 1
    }
    if (action === 'walk') { bob = tick % 2 ? -1 : 0; lean = (gaze >= 0 ? 1 : -1) * .03 }
    if (action === 'listening') {
      lean = readingInput ? readingInput.energy * (readingInput.x * -.02 - .025) : 0
      bob = readingInput && readingInput.energy > .65 && tick % 6 === 2 ? -1 : 0
      if (readingInput?.composing) lean *= .7
    }
    if (action === 'thinking') { lean = tick % 10 < 5 ? -.08 : .045; bob = tick % 10 === 4 ? -1 : 0 }
    if (action === 'searching') { bob = tick % 5 === 2 ? -1 : 0; lean = tick % 5 === 1 ? .025 : 0 }
    if (action === 'answering') lean = writingStep < 5 ? -.025 : .025
    if (action === 'done') bob = elapsed > 360 && elapsed < 800 ? -3 : 0
    if (action === 'tap' || bouncing) squash = action === 'tap' && elapsed > 220 ? 1 : .87
    if (action === 'tap' && elapsed > 220 && elapsed < 450) bob = -3
    if (action === 'grumpy') { lean = -.1; slide = elapsed < 750 ? -1 : 0 }
    if (action === 'sleeping') { lean = -.09; squash = tick % 12 < 6 ? .97 : 1 }
    if (action === 'yawn') { lean = elapsed > 450 && elapsed < 1_900 ? -.09 : -.03; squash = .96 }
    if (action === 'waking') { lean = elapsed < 220 ? -.07 : .04; bob = elapsed > 220 && elapsed < 450 ? -2 : 0 }
    if (action === 'source') lean = -.05
    if (action === 'error') lean = tick % 20 < 3 ? -.065 : -.035
    if (action === 'greet') { lean = ([0, -.09, .07, -.07, .04, 0] as const)[Math.min(5, Math.floor(elapsed / 190))]; bob = beat > 1 && beat < 7 ? -1 : 0 }
    if (action === 'peek') { slide = beat < 4 ? -2 : beat < 8 ? 1 : 0; lean = beat < 4 ? .08 : beat < 8 ? -.065 : 0 }
    if (action === 'ribbon') lean = beat % 6 < 3 ? .045 : -.035
    if (action === 'ruffle') { bob = beat % 3 === 1 ? -1 : 0; lean = beat % 2 ? .025 : -.025 }
    if (action === 'stretch') { squash = elapsed > 280 && elapsed < 1_650 ? 1.08 : .96; spread = elapsed > 280 && elapsed < 1_650 ? 1.05 : 1; lean = -.025 }
    if (action === 'hop') {
      bob = ([0, 1, 0, -2, -4, -3, -1, 1, 0, -2, -1, 0] as const)[Math.min(11, Math.floor(elapsed / 110))]
      squash = bob > 0 ? .88 : bob < -1 ? 1.04 : 1
    }
    if (action === 'spin') { spread = ([1, .72, .4, .15, .4, .72, 1, .85, 1, 1] as const)[spinFrame]; bob = spinFrame < 7 ? -1 : 0 }
    if (action === 'tucking') squash = Math.max(.12, 1 - elapsed / 300)
  }
  const output = new Uint8ClampedArray(size * size * 4)
  // Keep the ground shadow separate from the moving book.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4
    if (pixels.data[index + 3] > 0 && pixels.data[index + 3] < 255) {
      for (let channel = 0; channel < 4; channel++) output[index + channel] = pixels.data[index + channel]
    }
  }
  // Sample backwards from each output pixel so stretching cannot leave empty seams.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sourceY = Math.round(40 + (y - 40 - bob) / squash)
    const sourceX = Math.round(24 + (x - 24 - (sourceY - 38) * lean - slide) / spread)
    if (sourceX < 0 || sourceX >= size || sourceY < 0 || sourceY >= size) continue
    const index = (sourceY * size + sourceX) * 4
    if (pixels.data[index + 3] === 255) {
      const target = (y * size + x) * 4
      for (let channel = 0; channel < 4; channel++) output[target + channel] = pixels.data[index + channel]
    }
  }
  context.putImageData(new ImageData(output, size, size), 0, 0)
}
