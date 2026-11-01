import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const output = ts.transpileModule(readFileSync(new URL('../src/components/bookSpiritSandbox.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { BookSandbox } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
const book = (id, x, y, width = 128) => ({ id, x, y, width, height: 20, tone: 0 })
function empty(input = null) { const w = new BookSandbox();w.resize(1000, 800, input);w.books = [];return w }
function run(w, until = 4000, enabled = false) { for (let t = 50; t <= until; t += 50) w.tick(t, enabled, false) }

test('static floating books support the falling pet without moving themselves', () => {
  const w = empty();w.books = [book('book-1', 180, 500)];Object.assign(w.body, { x: 190, y: 100 })
  run(w);assert.equal(w.body.y + 96, 500);assert.equal(w.body.support, 'book-1');assert.equal(w.books[0].y, 500)
  w.moveBook('book-1', 600, 300, 16, true);run(w, 7000)
  assert.equal(w.body.y + 96, w.floor);assert.equal(w.body.support, 'floor');assert.equal(w.books[0].y, 300)
})

test('slow support movement carries the pet while fast removal releases it', () => {
  const w = empty();w.books = [book('book-1', 180, 500)];Object.assign(w.body, { x: 190, y: 404 });w.tick(50, false, false)
  assert.equal(w.body.support, 'book-1')
  w.moveBook('book-1', 185, 495, 100, true);assert.equal(w.body.x, 195);assert.equal(w.body.y, 399)
  w.moveBook('book-1', 600, 200, 16, true);assert(!w.body.grounded);assert.equal(w.body.y, 399)
  w.tick(100, false, false);assert(w.body.y > 399)
})

test('the input is a local solid: roof, underside, sides, and free space below its sides', () => {
  const input = { id: 'input', x: 300, y: 400, width: 400, height: 64 }
  const w = empty(input);Object.assign(w.body, { x: 400, y: 100 });run(w)
  assert.equal(w.body.y + 96, 400)
  Object.assign(w.body, { x: 80, y: 410 });w.grab(900, 410);assert.equal(w.body.x + 96, 300)
  Object.assign(w.body, { x: 750, y: 410, vy: 0 });run(w, 7000);assert.equal(w.body.y + 96, w.floor)
  Object.assign(w.body, { x: 400, y: 490, vy: -610 });w.tick(7050, false, false);w.tick(7100, false, false)
  assert(w.body.y >= input.y + input.height)
})

test('book placement avoids the input, snaps, persists, resizes and can be undone', () => {
  const input = { id: 'input', x: 300, y: 400, width: 400, height: 64 }
  const w = new BookSandbox();w.resize(1000, 800, input)
  const before = w.snapshot();w.remember();w.moveBook('book-1', 400, 420, 100, true)
  const b = w.books[0];assert(!(b.x < 700 && b.x + b.width > 300 && b.y < 464 && b.y + b.height > 400))
  w.moveBook('book-1', 180, 200, 100, true);const saved = w.commit()
  const restored = new BookSandbox(saved);restored.resize(1000, 800, input)
  assert(Math.abs(restored.books[0].x - 180) < .001 && Math.abs(restored.books[0].y - 200) < .001)
  restored.resize(320, 568, { id: 'input', x: 24, y: 320, width: 272, height: 58 })
  assert(restored.books.every(b => b.x >= 8 && b.x + b.width <= 312 && b.y >= 8 && b.y + b.height <= 560))
  assert(w.undo());assert(w.snapshot().books.every((b, i) => Math.abs(b.x - before.books[i].x) < .001 && Math.abs(b.y - before.books[i].y) < .001))
  w.books = [book('book-1', 100, 500), book('book-2', 400, 300)]
  w.moveBook('book-2', 104, 475, 100, false);assert.equal(w.books[1].x, 100);assert.equal(w.books[1].y, 480)
})

test('a reachable staircase is traversed physically and an isolated high book is unreachable', () => {
  const w = empty();w.books = [book('book-1', 120, 712), book('book-2', 250, 632), book('book-3', 380, 552), book('book-4', 700, 180)]
  Object.assign(w.body, { x: 16, y: w.floor - 96 });w.tick(50, false, false)
  assert(!w.plan('book-4'));assert(w.plan('book-3'))
  const visited = new Set()
  for (let t = 100; t <= 20000; t += 50) { w.tick(t, true, false);if (w.body.support) visited.add(w.body.support);if (w.body.support === 'book-3') break }
  assert(visited.has('book-1') && visited.has('book-2') && visited.has('book-3'), `visited ${[...visited]} at ${JSON.stringify(w.body)}`)
})

test('reduced motion settles immediately without moving books and invalid saved input is ignored', () => {
  const w = new BookSandbox({ version: 1, books: [{ id: 'book-1', x: NaN, y: 0 }] });w.resize(390, 844, null)
  w.books = [book('book-1', 150, 500)];Object.assign(w.body, { x: 160, y: 100 });w.tick(50, false, true)
  assert.equal(w.body.y + 96, 500);assert.equal(w.books[0].y, 500);assert.equal(w.route.length, 0)
})

test('the pet walks around the input to reach the lower world, also on a narrow phone', () => {
  for (const width of [320, 1000]) {
    const w = new BookSandbox();w.resize(width, 800, { id: 'input', x: width < 700 ? 21 : 300, y: 450, width: width < 700 ? width - 42 : 400, height: 64 })
    Object.assign(w.body, { x: w.input.x + 8, y: w.input.y - 96, vx: 0, vy: 0 })
    w.tick(50, false, false)
    assert(w.plan('book-9'))
    let reachedLower = false
    for (let t = 100; t <= 25000; t += 50) {
      w.tick(t, true, false)
      const b = w.body, r = w.input
      assert(!(b.x < r.x + r.width - .1 && b.x + 96 > r.x + .1 && b.y < r.y + r.height - .1 && b.y + 96 > r.y + .1), 'must go around rather than through input')
      if (b.y > r.y + r.height) reachedLower = true
      if (reachedLower && b.support?.startsWith('book-')) break
    }
    assert(reachedLower, `width ${width}: ${JSON.stringify(w.body)}`)
  }
})

test('an invitation during a fall waits for landing, and input interruption cancels it', () => {
  const w = empty();w.books = [book('book-1', 300, 712)];Object.assign(w.body, { x: 100, y: 200 })
  assert(w.requestBook('book-1'));assert.equal(w.pendingGoal, 'book-1')
  for (let t = 50; t <= 5000; t += 50) { w.tick(t, true, false);if (w.body.support === 'book-1') break }
  assert.equal(w.body.support, 'book-1');assert.equal(w.pendingGoal, null)
  Object.assign(w.body, { y: 100, grounded: false, support: null });w.requestBook('book-1');w.tick(5050, false, false)
  assert.equal(w.pendingGoal, null);assert.equal(w.route.length, 0)
})

const overlap = (a, b) => a.x < b.x + b.width - .001 && a.x + a.width > b.x + .001 && a.y < b.y + b.height - .001 && a.y + a.height > b.y + .001
function legalBooks(w) {
  const visible = w.books.filter(b => !b.stowed)
  for (const [i, b] of visible.entries()) {
    assert(b.x >= 8 && b.y >= 8 && b.x + b.width <= w.width - 8 && b.y + b.height <= w.height - 8)
    assert(!visible.slice(i + 1).some(other => overlap(b, other)), `books overlap: ${b.id}`)
    assert(!w.controls.some(control => overlap(b, control)), `book covers UI: ${b.id}`)
    assert(!w.input || !overlap(b, w.input), `book covers composer: ${b.id}`)
  }
}
test('old overlapping layouts, phone resize, drag and undo keep books disjoint', () => {
  const saved = { version: 1, books: Array.from({ length: 10 }, (_, i) => ({ id: `book-${i + 1}`, x: .1, y: .8 })) }
  const w = new BookSandbox(saved);w.resize(1440, 900, null);legalBooks(w)
  w.resize(320, 568, { id: 'input', x: 20, y: 340, width: 280, height: 60 });legalBooks(w)
  assert.equal(w.books.filter(b => !b.stowed).length, 10)
  for (let i = 0; i < 30; i++) { w.remember();w.moveBook(`book-${i % 10 + 1}`, 110, 450, 100, i % 2 === 0);legalBooks(w) }
  assert(w.undo());legalBooks(w)
})
test('book-on-book placement contacts a face and does not push the other book', () => {
  const w = empty();w.books = [book('book-1', 200, 400), book('book-2', 400, 200)]
  w.moveBook('book-2', 200, 400, 100, true);legalBooks(w)
  assert.equal(w.books[0].x, 200);assert.equal(w.books[0].y, 400)
  assert.equal(Math.abs(w.books[1].y - 400), 20)
})
test('new UI obstacles displace books, while controls remain permeable to the pet', () => {
  const w = empty();w.books = [book('book-1', 20, 730)]
  const gear = { id: 'ui-settings', x: 14, y: 720, width: 50, height: 60 }
  w.resize(1000, 800, null, [gear]);legalBooks(w)
  assert(!w.solids.some(s => s.id === gear.id))
  w.books = [];w.grab(20, 700);assert.equal(w.body.x, 20);assert.equal(w.body.y, 696)
})
test('workspace entry stacks at lower left, protects settings, and preserves the home layout', () => {
  for (const width of [1440, 390, 320]) {
    const w = new BookSandbox(), input = { id: 'input', x: width < 700 ? 20 : 350, y: width < 700 ? 470 : 785, width: width < 700 ? width - 40 : 720, height: 64 }
    const gear = { id: 'ui-settings', x: width < 700 ? 8 : 14, y: width < 700 ? 414 : 836, width: 50, height: 50 }
    w.resize(width, 900, input, [gear], false)
    w.moveBook('book-1', width - 150, 150, 100, true);const home = w.commit()
    w.resize(width, 900, input, [gear], true);legalBooks(w)
    assert(w.books.every(b => b.x < 220 && !b.stowed), `width ${width}: must fit compactly at left`)
    assert.equal(w.books.length, 10)
    assert.equal([...w.books].sort((a, b) => a.y - b.y)[0].id, 'book-6', '论语 caps the chat pile')
    assert.equal([...w.books].sort((a, b) => b.y - a.y)[0].id, 'book-2', '梦粱录 anchors the chat pile')
    assert(new Set(w.books.map(b => b.x)).size >= 5, 'chat pile has the reference staggered outline')
    w.moveBook('book-1', width - 150, 180, 100, true);w.commit()
    w.resize(width, 900, input, [gear], false)
    assert(Math.abs(w.snapshot().books[0].x - home.books[0].x) < .001)
    assert(Math.abs(w.snapshot().books[0].y - home.books[0].y) < .001)
    w.resize(width, 900, input, [gear], true);assert(w.books.every(b => b.x < 220));legalBooks(w)
  }
})
test('when UI fills the viewport, books stow rather than cover controls and return when space opens', () => {
  const w = new BookSandbox();w.resize(320, 568, null, [{ id: 'ui-full', x: 0, y: 0, width: 320, height: 568 }])
  assert(w.books.every(b => b.stowed));assert.equal(w.solids.length, 0)
  w.resize(320, 568, null, []);assert(w.books.every(b => !b.stowed));legalBooks(w)
})

test('welcome defaults form two lower-right piles with the pet on the left perch; reset and resize restore them', () => {
  for (const [width, height] of [[2559, 1389], [1440, 900], [390, 844], [320, 568]]) {
    const input = { id: 'input', x: width < 700 ? 24 : (width - 720) / 2, y: height / 2 - 32, width: width < 700 ? width - 48 : 720, height: 64 }
    const w = new BookSandbox();w.resize(width, height, input);legalBooks(w)
    assert.equal(w.body.support, 'book-9');assert.equal(w.body.y + 96, w.books[8].y)
    assert(w.books.every(b => b.x >= Math.max(8, width - 360) && b.y >= w.floor - 124))
    const expected = w.snapshot();assert.equal(expected.preset, 'corner-v1')
    w.moveBook('book-1', 20, 120, 100, true);w.grab(8, 8);w.arrange(true)
    assert.deepEqual(w.snapshot(), expected);assert.equal(w.body.support, 'book-9')
    w.grab(8, 8);w.arrange();assert.equal(w.body.support, 'book-9')
    const restored = new BookSandbox(w.commit());restored.resize(320, 568, { id: 'input', x: 24, y: 252, width: 272, height: 64 });legalBooks(restored)
    assert.equal(restored.body.support, 'book-9');assert.equal(restored.books[1].x, 32)
  }
})


test('contained phone card keeps the pet fully inside local bounds after drag, release and rotation', () => {
  const w = new BookSandbox();w.contained = true;w.resize(320, 480, null)
  for (const x of [-200, 700]) {
    w.grab(x, 200);w.release(x < 0 ? -900 : 900, 400);run(w)
    assert(w.body.x >= 8);assert(w.body.x + 96 <= w.width - 8)
    assert(w.body.y >= 8);assert(w.body.y + 96 <= w.floor)
  }
  w.resize(480, 300, null)
  assert(w.body.x >= 8);assert(w.body.x + 96 <= w.width - 8)
  for (const b of w.books.filter(b => !b.stowed)) {
    assert(b.x >= 8 && b.y >= 8);assert(b.x+b.width <= w.width-8);assert(b.y+b.height <= w.height-8)
  }
})

test('contained mobile page keeps the pet reachable after desktop resize and release beside the composer', () => {
  const w = new BookSandbox()
  w.resize(1440, 900, null, [], true)
  w.books.forEach(book => { book.stowed = true })
  w.grab(1300, 700)
  w.contained = true
  const input = { id: 'input', x: 12, y: 726, width: 366, height: 62 }
  w.resize(390, 844, input, [], true)
  w.books.forEach(book => { book.stowed = true })
  for (const x of [-200, 700]) {
    w.grab(x, 500);w.release(x < 0 ? -900 : 900, 400);run(w)
    assert(w.body.x >= 8)
    assert(w.body.x + 96 <= 382)
    assert(w.body.y >= 8)
    assert(w.body.y + 96 <= w.floor)
  }
})
