import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadTypeScript(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
}
const { BookSpiritController } = await loadTypeScript('../src/components/bookSpiritController.ts')
const { BookSpiritRoam, sampleSpiritProp } = await loadTypeScript('../src/components/bookSpiritRoam.ts')
const { advanceSpiritFall, clampSpirit, overlaps } = await loadTypeScript('../src/components/bookSpiritGeometry.ts')
test('book states remain distinct and task work takes priority over play', () => {
  const c = new BookSpiritController(0)
  c.setActivity('inspecting', 10); assert.equal(c.pose(20, 'quiet').action, 'inspecting')
  c.setActivity('empty', 30); assert.equal(c.pose(40, 'quiet').action, 'empty')
  c.setActivity('error', 50); assert.equal(c.pose(60, 'quiet').action, 'error')
  c.setActivity('searching', 70); c.interact('hop', 80, 'quiet'); assert.equal(c.pose(90, 'quiet').action, 'searching')
})
test('history flip survives a view transition and lasts 1.8 seconds', () => {
  const c = new BookSpiritController(0)
  c.interact('flip', 100, 'quiet'); c.setActivity('done', 150)
  assert.equal(c.pose(1899, 'quiet').action, 'flip')
  assert.notEqual(c.pose(1901, 'quiet').action, 'flip')
})
test('night modifier shortens sleep delay, milestones wait until work ends', () => {
  const c = new BookSpiritController(0)
  c.night = true; assert.equal(c.pose(23000, 'quiet').action, 'yawn'); assert.equal(c.pose(25000, 'quiet').action, 'sleeping')
  c.setActivity('answering', 26000); c.interact('celebrate', 26000, 'quiet')
  assert.equal(c.pose(27000, 'quiet').action, 'answering')
  c.setActivity('empty', 28000); assert.equal(c.pose(28001, 'quiet').action, 'celebrate'); assert.equal(c.particleBurstAt, 28001)
})
test('returning burst fires once, blocked work interrupts roaming immediately', () => {
  const c = new BookSpiritController(0); c.interact('returning', 700, 'quiet')
  assert.equal(c.pose(710, 'quiet').action, 'returning'); const burst = c.particleBurstAt
  c.pose(5000, 'quiet'); assert.equal(c.particleBurstAt, burst)
  const r = new BookSpiritRoam(0);r.setStage({ width: 1000, height: 144 }, 0)
  const scheduled = r.nextRoamAt + 1
  assert(r.tick(scheduled, { canRoam: true, blocked: false }).acting)
  assert.equal(r.tick(scheduled + 100, { canRoam: false, blocked: true }).acting, false)
})
test('six theaters complete within five seconds and scenery crumbles away', () => {
  for (const kind of ['hopscotch', 'tower', 'airing', 'chase', 'doze', 'carry']) {
    const r = new BookSpiritRoam(0);r.setStage({ width: 1440, height: 480, fullPage: true }, 0);r.perform(kind, 0)
    assert(r.acting, kind)
    if (kind === 'tower') assert(r.blocks.length >= 3 && r.blocks.length <= 4)
    if (kind === 'hopscotch') assert.equal(r.blocks.length, 4)
    for (let t = 50; t <= 5050; t += 50) r.tick(t, { canRoam: true, blocked: false })
    assert.equal(r.acting, false, kind + ' exceeded five seconds')
    r.tick(8000, { canRoam: false, blocked: false });assert.equal(r.blocks.length, 0, kind + ' left scenery behind')
  }
})

const paperTheaters = ['airing', 'flutter', 'paperplane', 'paper-chase', 'tidy', 'ribbon-play']
test('detached props leave the body, fit both screen edges, and finish within five seconds', () => {
  for (const width of [320, 1440]) for (const edge of ['left', 'right']) for (const kind of paperTheaters) {
    const r = new BookSpiritRoam(0)
    const ground = 500
    r.setStage({ width, height: ground + 8, fullPage: true }, 0)
    r.x = edge === 'left' ? 8 : width - 104
    r.perform(kind, 0)
    let escaped = false, visible = false
    for (let now = 50; now <= 5100; now += 50) {
      r.tick(now, { canRoam: true, blocked: false })
      for (const prop of r.props) {
        const pose = sampleSpiritProp(prop, now)
        if (!pose || pose.alpha < .1) continue
        visible = true
        assert(pose.x >= 24 && pose.x <= width - 24 && pose.y >= 26 && pose.y <= ground - 22, kind)
        if (pose.x < r.x || pose.x > r.x + 96 || pose.y < ground - 96 - r.lift) escaped = true
      }
    }
    assert(visible && escaped, `${width}/${edge}/${kind} must visibly escape the character canvas`)
    assert.equal(r.acting, false, kind)
    assert.equal(r.props.length, 0, kind + ' left paper behind')
    assert.equal(r.particles.length, 0, kind + ' left dust behind')
  }
})

test('typing recalls paper once, drops future emissions, and motion disable clears effects', () => {
  for (const kind of paperTheaters) {
    const r = new BookSpiritRoam(0);r.setStage({ width: 390, height: 708, fullPage: true }, 0);r.perform(kind, 0)
    for (let now = 50; now <= 1100; now += 50) r.tick(now, { canRoam: true, blocked: false })
    assert(r.props.some(p => sampleSpiritProp(p, 1100)?.alpha > .1), kind)
    r.tick(1150, { canRoam: false, blocked: true })
    assert.equal(r.acting, false)
    assert(r.particles.every(p => p.bornAt <= 1150))
    for (let now = 1200; now <= 1500; now += 50) r.tick(now, { canRoam: false, blocked: true })
    assert.equal(r.props.length, 0, kind + ' recall must not restart every frame')
    r.perform(kind, 2000);r.clearEffects()
    assert.equal(r.props.length, 0);assert.equal(r.particles.length, 0)
  }
})

test('resizing during paper play recalls props and aborts the obsolete route', () => {
  const r = new BookSpiritRoam(0);r.setStage({ width: 1440, height: 808, fullPage: true }, 0)
  r.x = 1300;r.perform('paper-chase', 0)
  for (let t = 50; t <= 1800; t += 50) r.tick(t, { canRoam: true, blocked: false })
  r.setStage({ width: 320, height: 508, fullPage: true }, 1850)
  assert.equal(r.acting, false)
  assert(r.x >= 6 && r.x + 96 <= 320)
  r.tick(2200, { canRoam: false, blocked: true });assert.equal(r.props.length, 0)
})
test('optional collision rectangles keep the spirit within viewport bounds', () => {
  const brand = { left: 20, top: 20, width: 90, height: 40 }
  const layout = { width: 1440, height: 900, ground: 480, obstacles: [brand] }
  const atBrand = clampSpirit(24, 350, layout)
  assert(!overlaps({ left: atBrand.x, top: layout.ground - 96 - atBrand.lift, width: 96, height: 96 }, brand))
  const outside = clampSpirit(99999, 99999, layout)
  assert(outside.x + 96 <= 1440 && layout.ground - 96 - outside.lift >= 8)
})

test('full-page motion reaches both sidebars and the header, then lands above the input', () => {
  const layout = { width: 1440, height: 900, ground: 817, obstacles: [] }
  // These positions lie outside the former 692 x 144 composer-stage bounds.
  for (const x of [20, 1320]) {
    const high = clampSpirit(x, 701, layout)
    assert.equal(high.x, x)
    assert.equal(layout.ground - 96 - high.lift, 20)
    const fall = { ...high, vx: 0, velocity: 0, last: 0 }
    let landed = false
    for (let now = 50; now <= 4000; now += 50) {
      landed = advanceSpiritFall(fall, now, layout)
      assert(fall.lift >= 0, 'must never cross the input floor')
      if (landed) break
    }
    assert(landed)
    assert.equal(layout.ground - fall.lift, 817)
  }
  const below = clampSpirit(700, -300, layout)
  assert.equal(below.lift, 0)
  const resized = clampSpirit(1320, 701, { width: 390, height: 844, ground: 700, obstacles: [] })
  assert(resized.x + 96 <= 390 && 700 - 96 - resized.lift >= 8)
})
