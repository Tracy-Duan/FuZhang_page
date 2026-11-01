import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadTypeScript(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
}
const { PetGestureTracker } = await loadTypeScript('../src/components/bookSpiritGesture.ts')
const { pickReaction, isDirectReaction } = await loadTypeScript('../src/components/companionReactions.ts')
const { advanceSpiritFall } = await loadTypeScript('../src/components/bookSpiritGeometry.ts')

test('back-and-forth dragging is recognised as a shake', () => {
  const tracker = new PetGestureTracker()
  tracker.down(100, 100, 0)
  let gesture
  for (const [index, x] of [140, 100, 140, 100, 140, 100].entries()) {
    gesture = tracker.move(x, 100, 50 + index * 50) || gesture
  }
  assert.equal(gesture, 'shake')
  assert.equal(tracker.up(400), undefined)
})

test('a fast release becomes a fling', () => {
  const tracker = new PetGestureTracker()
  tracker.down(100, 100, 0)
  tracker.move(300, 100, 100)
  assert.equal(tracker.up(110), 'fling')
})

test('holding still without moving becomes a hold', () => {
  const tracker = new PetGestureTracker()
  tracker.down(100, 100, 0)
  tracker.move(102, 101, 200)
  assert.equal(tracker.up(1_500), 'hold')
})

test('a short tap stays a tap', () => {
  const tracker = new PetGestureTracker()
  tracker.down(100, 100, 0)
  assert.equal(tracker.up(120), undefined)
})

test('small high-frequency samples still form deliberate horizontal or vertical shakes', () => {
  for (const vertical of [false, true]) {
    const tracker = new PetGestureTracker()
    tracker.down(100, 100, 0)
    let result, time = 0, offset = 0
    for (const target of [40, -40, 40, -40]) {
      const step = Math.sign(target - offset)
      while (offset !== target) {
        offset += step; time += 2
        result = tracker.move(100 + (vertical ? 0 : offset), 100 + (vertical ? offset : 0), time) || result
      }
    }
    assert.equal(result, 'shake')
    assert.equal(tracker.up(time + 10), undefined, 'A shake must not become a second fling on release')
  }
})

test('slow direction changes and mouse jitter are not shakes', () => {
  const tracker = new PetGestureTracker()
  tracker.down(0, 0, 0)
  for (const [index, x] of [40, 0, 40, 0, 40].entries()) assert.equal(tracker.move(x, 0, 500 + index * 500), undefined)
  tracker.down(100, 100, 0)
  for (let i = 0; i < 300; i++) assert.equal(tracker.move(100 + i % 3, 100 + i % 2, i * 2), undefined)
})

test('hold acknowledges before release, tolerates jitter and fires once per press', () => {
  const tracker = new PetGestureTracker()
  tracker.down(100, 100, 0)
  for (let i = 0; i < 80; i++) tracker.move(100 + i % 2, 100, i * 10)
  assert.equal(tracker.poll(899), undefined)
  assert.equal(tracker.poll(910), 'hold')
  assert.equal(tracker.poll(2000), undefined)
  assert.equal(tracker.up(2100), undefined)
  tracker.down(0, 0, 2200);tracker.move(20, 0, 2300);tracker.move(0, 0, 2400)
  assert.equal(tracker.poll(4000), undefined, 'Moving out and back must not become a hold')
})

test('release recognises diagonal and vertical velocity but excludes a paused or cancelled drag', () => {
  for (const end of [[100, -150], [250, -50]]) {
    const tracker = new PetGestureTracker()
    tracker.down(100, 100, 0);tracker.move(...end, 100)
    assert.equal(tracker.up(110), 'fling')
    tracker.down(100, 100, 200);tracker.move(...end, 300)
    assert.equal(tracker.up(600), undefined)
    tracker.down(100, 100, 700);tracker.move(...end, 800);tracker.cancel()
    assert.equal(tracker.poll(2000), undefined);assert.equal(tracker.up(2000), undefined)
  }
})

test('sparse pointer samples retain velocity and standing still never becomes a fling', () => {
  const tracker = new PetGestureTracker()
  tracker.down(0, 0, 0);tracker.move(240, 0, 200)
  assert.equal(tracker.up(210), 'fling')
  tracker.down(0, 0, 1000);assert.equal(tracker.up(1010), undefined)
})

test('manual gestures always pick a reply while ambient speech can remain silent', () => {
  const original = Math.random
  try {
    Math.random = () => 0
    const options = { night: false, recent: [], onceSeen: new Set() }
    for (const kind of ['shake', 'fling', 'hold', 'hover', 'poke', 'high']) {
      assert(isDirectReaction(kind));assert(pickReaction(kind, options)?.text, kind)
    }
    assert.equal(pickReaction('done', options), undefined)
    assert.equal(isDirectReaction('done'), false)
  } finally { Math.random = original }
})

test('fling carries momentum, lands, and remains inside the collision bounds', () => {
  const layout = { width: 900, height: 900, ground: 450, obstacles: [{ left: 500, top: 0, width: 80, height: 300 }] }
  const fall = { x: 200, lift: 120, vx: 950, velocity: -400, last: 0 }
  let landed = false
  for (let now = 50; now <= 4000; now += 50) {
    landed = advanceSpiritFall(fall, now, layout)
    assert(fall.x >= 8 && fall.x <= 796);assert(fall.lift >= 0 && fall.lift <= 346)
    if (landed) break
  }
  assert(landed);assert(fall.x > 250, 'A fling must travel after release')
  assert.equal(fall.lift, 0)
})
