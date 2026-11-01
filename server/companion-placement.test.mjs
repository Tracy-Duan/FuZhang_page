import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/companionPlacement.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { companionPlacement } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
test('chat remains fully inside narrow, keyboard-reduced, scrolled, and desktop viewports', () => {
  for (const viewport of [
    { left: 0, top: 0, width: 320, height: 568 },
    { left: 0, top: 240, width: 375, height: 240 },
    { left: 20, top: 140, width: 240, height: 180 },
    { left: 0, top: 0, width: 1440, height: 900 },
  ]) for (const pet of [{ left: -80, right: 16, top: 800 }, { left: 1300, right: 1396, top: 0 }, undefined]) {
    const result = companionPlacement(viewport, pet)
    assert(result.left >= viewport.left + 12)
    assert(result.top >= viewport.top + 12)
    assert(result.left + result.width <= viewport.left + viewport.width - 12)
    assert(result.top + result.height <= viewport.top + viewport.height - 12)
  }
})
test('moving the character changes the anchored dialog coordinates without changing size', () => {
  const viewport = { left: 0, top: 0, width: 1440, height: 900 }
  const first = companionPlacement(viewport, { left: 100, right: 196, top: 500 })
  const moved = companionPlacement(viewport, { left: 400, right: 496, top: 600 })
  assert.equal(moved.left - first.left, 300)
  assert.equal(moved.top - first.top, 100)
  assert.equal(moved.width, first.width)
  assert.equal(moved.height, first.height)
})
