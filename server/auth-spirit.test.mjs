import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/auth/authSpirit.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { AuthSpiritDirector } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))

test('auth arrival survives autofocus while password shielding takes immediate priority', () => {
  const spirit = new AuthSpiritDirector(100)
  spirit.react('username', 120)
  assert.equal(spirit.pose(200).action, 'hop')
  assert.equal(spirit.pose(800).action, 'listening')
  spirit.react('password', 250)
  assert.equal(spirit.pose(251).action, 'shield')
})

test('only non-secret fields can update normalized eye gaze', () => {
  const spirit = new AuthSpiritDirector(0)
  spirit.react('username', 1000);spirit.lookAt(99, 1100)
  assert.equal(spirit.lookX, 2)
  spirit.lookAt(-99, 1200);assert.equal(spirit.lookX, -2)
  spirit.lookAt(NaN, 1300);assert.equal(spirit.lookX, 0)
  spirit.react('password', 1400);spirit.lookAt(1, 1500)
  assert.equal(spirit.lookX, 0);assert.equal(spirit.pose(1600).action, 'shield')
  spirit.react('rest', 1700);assert.equal(spirit.pose(1800).action, 'idle')
})

test('tab changes finish a short flip then inspect the invite without asserting its validity', () => {
  const spirit = new AuthSpiritDirector(0)
  spirit.react('mode', 2000);const line = spirit.react('invite', 2050)
  assert.equal(spirit.pose(2100).action, 'flip')
  assert.equal(spirit.pose(3000).action, 'inspecting')
  assert(!/有效|通过|正确|无效/.test(line))
})

test('submit remains busy until a result; errors react and then settle', () => {
  const spirit = new AuthSpiritDirector(0)
  spirit.react('submit', 2000)
  assert.equal(spirit.pose(9000).action, 'searching')
  spirit.react('error', 9100)
  assert.equal(spirit.pose(9200).action, 'waking')
  assert.equal(spirit.pose(11000).action, 'idle')
  spirit.react('tap', 12000);assert.equal(spirit.pose(12010).action, 'greet')
  assert.equal(spirit.pose(14000).action, 'idle')
})

test('native invalid-field focus preserves the error acknowledgement but never delays password shielding', () => {
  const spirit = new AuthSpiritDirector(0)
  spirit.react('error', 2000)
  assert.equal(spirit.react('username', 2010), '有一处没对上，再看一眼。')
  assert.equal(spirit.pose(2020).action, 'waking')
  spirit.react('password', 2030)
  assert.equal(spirit.pose(2040).action, 'shield')
})
