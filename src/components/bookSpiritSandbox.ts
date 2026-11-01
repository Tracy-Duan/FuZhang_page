export interface SandboxRect { id: string; x: number; y: number; width: number; height: number }
export interface BuildingBook extends SandboxRect { tone: number; stowed?: boolean }
export interface BookLayout { version: 1; preset?: 'corner-v1'; books: { id: string; x: number; y: number }[] }
export interface SandboxBody { x: number; y: number; vx: number; vy: number; grounded: boolean; support: string | null }
export interface SandboxSurface { id: string; left: number; right: number; top: number }
const SIZE = 96, GRAVITY = 1500, JUMP = 610, SPEED = 175
const bound = (n: number, a: number, b: number) => Math.max(a, Math.min(Math.max(a, b), n))
const intersect = (a: SandboxRect, b: SandboxRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const bodyRect = (body: SandboxBody): SandboxRect => ({ id: 'pet', x: body.x, y: body.y, width: SIZE, height: SIZE })

/** Static books, a solid input, and a single dynamic body. No React/frame state. */
export class BookSandbox {
  width = 0; height = 0
  books: BuildingBook[] = []
  input: SandboxRect | null = null
  // UI controls constrain books only. The pet still has just the local input wall.
  controls: SandboxRect[] = []
  workspace = false
  contained = false
  extra: SandboxRect[] = []
  body: SandboxBody = { x: 8, y: 8, vx: 0, vy: 0, grounded: false, support: null }
  revision = 0
  dragging: string | null = null
  route: SandboxSurface[] = []
  manualRoute = false
  pendingGoal: string | null = null
  notice = ''
  private elapsed = 0
  private last = 0
  private nextPlan = 0
  private lastJump = -Infinity
  private saved: BookLayout | undefined
  private undoState: BookLayout | undefined
  private routeSince = 0
  constructor(saved?: unknown) {
    if (saved && typeof saved === 'object' && (saved as BookLayout).version === 1 && Array.isArray((saved as BookLayout).books)) {
      this.saved = { version: 1, ...((saved as BookLayout).preset === 'corner-v1' ? { preset: 'corner-v1' as const } : {}), books: (saved as BookLayout).books.filter(b => b && typeof b.id === 'string' && Number.isFinite(b.x) && Number.isFinite(b.y)).slice(0, 10) }
    }
  }
  get floor() { return Math.max(96, this.height - 8) }
  get lift() { return Math.max(0, this.floor - this.body.y - SIZE) }
  // Narrow screens need a short visible side passage around the almost-full-width input.
  private get minPetX() { return this.width < 700 && !this.contained ? -80 : 8 }
  private get maxPetX() { return this.width < 700 && !this.contained ? this.width - 16 : this.width - SIZE - 8 }
  get moving() { return !this.body.grounded || this.route.length > 0 || Boolean(this.dragging) }
  get solids(): SandboxRect[] { return [...this.books.filter(b => !b.stowed), ...(this.input ? [this.input] : []), ...this.extra] }

  resize(width: number, height: number, input: SandboxRect | null, controls: SandboxRect[] = this.controls, workspace = this.workspace) {
    const changed = this.width !== width || this.height !== height
    const first = !this.width
    const viewChanged = this.workspace !== workspace
    const oldFloor = this.floor
    if (viewChanged && workspace && this.width) this.saved = this.snapshot()
    this.width = width; this.height = height; this.input = input;this.controls = controls;this.workspace = workspace
    if (first || changed || viewChanged) {
      const saved = this.saved
      this.placeBooks(this.defaults().map(book => {
        const position = !workspace && saved?.preset !== 'corner-v1' && saved?.books.find(b => b.id === book.id)
        return { ...book, ...(position ? { x: position.x * Math.max(1, width - book.width), y: position.y * Math.max(1, height - book.height) } : {}) }
      }))
      if (!first && this.body.grounded && this.body.support === 'floor') this.body.y += this.floor - oldFloor
      this.cancelRoute();this.revision++
      if (viewChanged) this.undoState = undefined
    } else {
      this.placeBooks(this.books)
      this.revision++
    }
    if (first || viewChanged || changed && !workspace && (!this.saved || this.saved.preset === 'corner-v1')) this.placePetAtStart()
    this.eject();this.detectSupport()
  }
  private defaults(): BuildingBook[] {
    const settings = this.controls.find(r => r.id === 'ui-settings')
    const stackX = settings ? settings.x + settings.width + 8 : 72
    // On a phone the fixed input occupies the bottom; stack immediately above it.
    const stackY = this.workspace && this.width < 700 && this.input ? this.input.y - 6 : this.floor
    // Two staggered piles from the approved reference: four books at left,
    // six at right, with a clear perch on 山海经 for the pet.
    const base = Math.max(8, this.width - (this.width < 700 ? 288 : 360))
    const positions = new Map<number, { x: number; y: number }>()
    const stacks = this.workspace ? [
      // Chat reference, bottom to top: 梦粱录 ... 论语.
      [[1, 7, 3, 4, 0, 6, 9, 8, 2, 5], [14, 0, 24, 4, 14, 34, 14, 14, 28, 24], 0],
    ] as const : [
      [[1, 3, 0, 8], [0, 22, 32, 22], 0],
      [[4, 7, 2, 9, 6, 5], [0, 12, 24, 0, 20, 0], 136],
    ] as const
    for (const [indices, offsets, column] of stacks) {
      let top = this.workspace ? stackY : this.floor
      indices.forEach((i, n) => { top -= [20, 24, 18][i % 3];positions.set(i, { x: (this.workspace ? stackX : base) + column + offsets[n], y: top }) })
    }
    return Array.from({ length: 10 }, (_, i) => {
      const width = [104, 128, 88][i % 3], height = [20, 24, 18][i % 3]
      const position = positions.get(i)!
      return { id: `book-${i + 1}`, ...position, width, height, tone: i % 5 }
    })
  }
  private placePetAtStart() {
    const perch = !this.workspace && this.books.filter(book => !book.stowed && book.y >= SIZE + 8)
      .sort((a, b) => Number(b.id === 'book-9') - Number(a.id === 'book-9'))
      .find(book => !this.solids.some(s => s.id !== book.id && intersect({ id: 'pet', x: book.x + (book.width - SIZE) / 2, y: book.y - SIZE, width: SIZE, height: SIZE }, s)))
    this.body = { x: perch ? perch.x + (perch.width - SIZE) / 2 : this.input ? this.input.x + 8 : 8,
      y: perch ? perch.y - SIZE : this.input ? this.input.y - SIZE : this.floor - SIZE, vx: 0, vy: 0, grounded: false, support: null }
  }
  private placeBooks(books: BuildingBook[]) {
    const placed: BuildingBook[] = []
    for (const book of books) placed.push(this.fitBook(book, placed))
    this.books = placed
  }
  private fitBook(book: BuildingBook, occupied = this.books.filter(b => b.id !== book.id)): BuildingBook {
    const clamp = (x: number, y: number) => ({ ...book, x: bound(x, 8, this.width - book.width - 8), y: bound(y, 8, this.height - book.height - 8) })
    const target = { ...clamp(book.x, book.y), stowed: false }
    const walls = [...occupied.filter(b => !b.stowed), ...this.controls, ...(this.input ? [this.input] : [])]
    const clear = (p: BuildingBook) => !walls.some(wall => intersect(p, wall))
    if (clear(target)) return target
    // Search adjacent faces, closest to the pointer first. Never push another book.
    const queue = [target], seen = new Set<string>()
    for (let tries = 0; queue.length && tries < 512; tries++) {
      queue.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
      const p = queue.shift()!, key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`
      if (seen.has(key)) continue
      seen.add(key)
      const hit = walls.find(wall => intersect(p, wall))
      if (!hit) return p
      queue.push(...[clamp(hit.x - book.width, p.y), clamp(hit.x + hit.width, p.y), clamp(p.x, hit.y - book.height), clamp(p.x, hit.y + hit.height)].map(p => ({ ...p, stowed: false })))
    }
    // Migration of densely overlapped old layouts and very small windows.
    const xs = new Set([8, this.width - book.width - 8, ...walls.flatMap(w => [w.x - book.width, w.x + w.width])])
    const ys = new Set([8, this.height - book.height - 8, ...walls.flatMap(w => [w.y - book.height, w.y + w.height])])
    let best: BuildingBook | undefined, distance = Infinity
    for (const x of xs) for (const y of ys) {
      if (x < 8 || x + book.width > this.width - 8 || y < 8 || y + book.height > this.height - 8) continue
      const d = Math.hypot(x - target.x, y - target.y)
      if (d < distance) { const p = { ...book, x, y };if (clear(p)) { best = p;distance = d } }
    }
    // If no legal spot exists, temporarily stow it rather than obstruct a control.
    return best ? { ...best, stowed: false } : { ...target, stowed: true }
  }
  snapshot(): BookLayout {
    const defaults = this.defaults()
    const preset = !this.workspace && this.books.length === 10 && this.books.every((b, i) => !b.stowed && Math.abs(b.x - defaults[i].x) < .01 && Math.abs(b.y - defaults[i].y) < .01)
    return { version: 1, ...(preset ? { preset: 'corner-v1' as const } : {}), books: this.books.map(b => ({ id: b.id, x: b.x / Math.max(1, this.width - b.width), y: b.y / Math.max(1, this.height - b.height) })) }
  }
  remember() { this.undoState = this.snapshot() }
  commit() { const snapshot = this.snapshot();if (!this.workspace) this.saved = snapshot;return snapshot }
  undo() {
    if (!this.undoState) return false
    const previous = this.snapshot(), saved = this.undoState;this.undoState = previous
    this.placeBooks(this.books.map(book => { const p = saved.books.find(p => p.id === book.id);return p ? { ...book, x: p.x * (this.width - book.width), y: p.y * (this.height - book.height) } : book }))
    if (!this.workspace) this.saved = this.snapshot()
    this.cancelRoute();this.eject();this.detectSupport();this.revision++;return true
  }
  arrange(reset = false) {
    this.remember();this.placeBooks(this.defaults());if (!this.workspace) this.saved = this.snapshot()
    if (reset || !this.workspace) this.placePetAtStart()
    this.cancelRoute();this.eject();this.detectSupport();this.revision++
  }
  moveBook(id: string, x: number, y: number, elapsedMs: number, free = false) {
    const book = this.books.find(b => b.id === id);if (!book) return
    if (!free) {
      const snap = (value: number, options: number[]) => options.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, value + 10)
      const others = this.books.filter(b => b.id !== id)
      const sx = snap(x, others.flatMap(b => [b.x, b.x + b.width, b.x - book.width, b.x + b.width - book.width]))
      const sy = snap(y, others.flatMap(b => [b.y - book.height, b.y + b.height, b.y]))
      if (Math.abs(sx - x) < 10) x = sx
      if (Math.abs(sy - y) < 10) y = sy
    }
    const next = this.fitBook({ ...book, x, y }), dx = next.x - book.x, dy = next.y - book.y
    const carrying = this.body.grounded && this.body.support === id
    Object.assign(book, next);this.cancelRoute()
    if (carrying) {
      const speed = Math.hypot(dx, dy) / Math.max(.016, elapsedMs / 1000)
      const destination = { ...bodyRect(this.body), x: this.body.x + dx, y: this.body.y + dy }
      const clear = destination.x >= 8 && destination.x + SIZE <= this.width - 8 && destination.y >= 8 && destination.y + SIZE <= this.floor && !this.solids.some(b => b.id !== id && intersect(destination, b))
      if (speed < 650 && clear) { this.body.x += dx;this.body.y += dy }
      else { this.body.grounded = false;this.body.support = null;this.body.vx = bound(dx / Math.max(.016, elapsedMs / 1000) * .15, -180, 180) }
    }
    this.eject();this.detectSupport();this.revision++
  }
  cancelRoute() { this.route = [];this.manualRoute = false;this.pendingGoal = null;this.body.vx = 0;this.nextPlan = this.last + 5000 }
  requestBook(id: string) {
    this.detectSupport()
    if (!this.body.grounded) { this.pendingGoal = id;return true }
    return this.plan(id)
  }
  grab(x: number, y: number) {
    this.cancelRoute();this.body.vx = 0;this.body.vy = 0
    this.move(x - this.body.x, y - this.body.y);this.detectSupport()
  }
  release(vx = 0, vy = 0) { this.body.vx = bound(vx, -900, 900);this.body.vy = bound(vy, -900, 900);this.detectSupport() }
  settle() {
    this.body.vx = 0;this.body.vy = 0;this.move(0, this.height);this.detectSupport()
  }
  private eject() {
    const b = this.body
    b.x = bound(b.x, this.minPetX, this.maxPetX);b.y = bound(b.y, 8, this.floor - SIZE)
    for (let pass = 0; pass < 12; pass++) {
      const rect = bodyRect(b), hit = this.solids.find(s => intersect(rect, s))
      if (!hit) break
      const candidates = [{ x: b.x, y: hit.y - SIZE }, { x: b.x, y: hit.y + hit.height }, { x: hit.x - SIZE, y: b.y }, { x: hit.x + hit.width, y: b.y }]
        .filter(p => p.x >= this.minPetX && p.x <= this.maxPetX && p.y >= 8 && p.y + SIZE <= this.floor && !this.solids.some(s => intersect({ ...rect, ...p }, s)))
      candidates.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))
      if (!candidates.length) { b.x = 8;b.y = 8;break }
      Object.assign(b, candidates[0]);b.vy = 0
    }
  }
  private move(dx: number, dy: number) {
    const b = this.body, solids = this.solids
    let x = bound(b.x + dx, this.minPetX, this.maxPetX)
    for (const s of solids) if (b.y < s.y + s.height - .1 && b.y + SIZE > s.y + .1) {
      if (dx > 0 && b.x + SIZE <= s.x + .1 && x + SIZE > s.x) x = Math.min(x, s.x - SIZE)
      if (dx < 0 && b.x >= s.x + s.width - .1 && x < s.x + s.width) x = Math.max(x, s.x + s.width)
    }
    b.x = x
    let y = bound(b.y + dy, 8, this.floor - SIZE)
    for (const s of solids) if (b.x + SIZE - 8 > s.x && b.x + 8 < s.x + s.width) {
      if (dy >= 0 && b.y + SIZE <= s.y + .1 && y + SIZE >= s.y) { y = Math.min(y, s.y - SIZE);b.vy = 0 }
      if (dy < 0 && b.y >= s.y + s.height - .1 && y < s.y + s.height) { y = Math.max(y, s.y + s.height);b.vy = 0 }
    }
    if (y <= 8 && b.vy < 0) b.vy = 0
    if (y >= this.floor - SIZE && b.vy > 0) b.vy = 0
    b.y = y
  }
  private detectSupport() {
    const b = this.body
    const support = this.solids.filter(s => Math.abs(b.y + SIZE - s.y) < .6 && b.x + SIZE - 8 > s.x && b.x + 8 < s.x + s.width).sort((a, c) => a.y - c.y)[0]
    b.support = support?.id || (Math.abs(b.y + SIZE - this.floor) < .6 ? 'floor' : null)
    b.grounded = Boolean(b.support) && b.vy >= 0
  }
  private surfaces(): SandboxSurface[] {
    return [{ id: 'floor', left: 8, right: this.width - 8, top: this.floor }, ...this.solids.map(b => ({ id: b.id, left: b.x, right: b.x + b.width, top: b.y }))]
      .filter(s => s.top >= SIZE + 8 && (s.id === 'floor' || !this.solids.some(r => r.id !== s.id && intersect({ id: '', x: (s.left + s.right) / 2 - 48, y: s.top - SIZE, width: SIZE, height: SIZE }, r))))
  }
  plan(id?: string) {
    this.detectSupport()
    if (!this.body.grounded) return false
    const surfaces = this.surfaces(), from = surfaces.find(s => s.id === this.body.support)
    if (!from) return false
    const queue: SandboxSurface[][] = [[from]], visited = new Set([from.id]), paths: SandboxSurface[][] = []
    while (queue.length) {
      const path = queue.shift()!, last = path[path.length - 1]
      if (path.length > 1 && (!id || last.id === id)) paths.push(path.slice(1))
      for (const target of surfaces) {
        const gap = Math.max(0, target.left - last.right, last.left - target.right), rise = last.top - target.top
        if (visited.has(target.id) || rise > 112 || gap > 132 || (rise < -260 && target.id !== 'floor')) continue
        const targetCenter = (target.left + target.right) / 2
        // A destination just beyond an edge can still leave the pet's feet on
        // the upper platform. Use the floor waypoint to clear that edge first.
        if (rise < -8 && target.id !== 'floor' && targetCenter >= last.left - 40 && targetCenter <= last.right + 40) continue
        // Books below a solid input cannot be reached by jumping through its underside.
        const startX = bound((last.left + last.right) / 2, target.left, target.right), endX = (target.left + target.right) / 2
        const barrier = this.input && this.input.id !== last.id && this.input.id !== target.id && intersect({ id: '', x: Math.min(startX, endX) - 38, y: Math.min(last.top, target.top) - 96, width: Math.abs(endX - startX) + 76, height: Math.abs(last.top - target.top) + 96 }, this.input)
        if (barrier) continue
        visited.add(target.id);queue.push([...path, target])
      }
    }
    const choices = id ? paths : paths.filter(p => p[p.length - 1].id.startsWith('book-'))
    if (!choices.length) return false
    const chosen = choices[Math.floor(Math.random() * choices.length)]
    this.route = chosen.map((surface, i) => {
      const previous = i ? chosen[i - 1] : from
      if (surface.id !== 'floor' || previous.id === 'floor') return surface
      const next = chosen[i + 1], preference = next ? (next.left + next.right) / 2 : this.body.x + 48
      const side = preference < (previous.left + previous.right) / 2 ? previous.left - 50 : previous.right + 50
      const center = bound(side - 48, this.minPetX, this.maxPetX) + 48
      return { ...surface, left: center - 1, right: center + 1 }
    })
    this.manualRoute = Boolean(id);this.routeSince = this.last;return true
  }
  tick(now: number, enabled: boolean, reduced: boolean, theatre?: { x: number; lift: number; action: string; since: number }) {
    const dt = this.last ? Math.min(.05, Math.max(0, (now - this.last) / 1000)) : .05
    this.last = now;this.elapsed += dt
    const b = this.body, wasGrounded = b.grounded
    this.detectSupport()
    if (!enabled || theatre) { this.route = [];this.manualRoute = false;this.pendingGoal = null;this.nextPlan = now + 5000 }
    if (enabled && this.pendingGoal && b.grounded) { const id = this.pendingGoal;this.pendingGoal = null;this.notice = this.plan(id) ? '她正在试着走过去。' : '这本暂时够不到，试着添一级台阶。' }
    if (enabled && !theatre && !this.route.length && now >= this.nextPlan) { this.plan();this.nextPlan = now + 5000 + Math.random() * 4000 }
    if (this.route.length) {
      const target = this.route[0], center = (target.left + target.right) / 2
      if (b.support === target.id) { this.route.shift();this.routeSince = now;if (!this.route.length) { this.manualRoute = false;this.nextPlan = now + 6000 } }
      else {
        const delta = center - b.x - 48
        b.vx = Math.abs(delta) > 6 ? Math.sign(delta) * SPEED : 0
        const support = this.surfaces().find(s => s.id === b.support)
        const launch = !support || center >= support.left && center <= support.right || b.x + SIZE >= support.right - 8 && delta > 0 || b.x <= support.left + 8 && delta < 0
        if (b.grounded && launch && now - this.lastJump > 650) { b.vy = -JUMP;b.grounded = false;b.support = null;this.lastJump = now }
        if (now - this.routeSince > 6000) { const manual = this.manualRoute;this.cancelRoute();if (manual) this.notice = '这条路没走通，试着挪一挪台阶。' }
      }
    } else if (theatre) {
      b.vx = bound((theatre.x - b.x) / Math.max(.01, dt), -260, 260)
      if (b.grounded && theatre.lift > this.lift + 5 && now - this.lastJump > 600) { b.vy = -JUMP;this.lastJump = now;b.grounded = false }
    } else if (b.grounded || !enabled) b.vx = 0
    if (reduced) { this.cancelRoute();this.settle();return !wasGrounded && b.grounded }
    b.vy += GRAVITY * dt
    const steps = Math.max(1, Math.ceil(dt / .012)), step = dt / steps
    for (let i = 0; i < steps; i++) this.move(b.vx * step, b.vy * step)
    if (!this.route.length && !theatre) b.vx *= Math.exp(-4 * dt)
    this.detectSupport()
    return !wasGrounded && b.grounded
  }
}
