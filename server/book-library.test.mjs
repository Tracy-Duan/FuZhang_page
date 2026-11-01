import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
async function load(path) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
}
const { BookTapSequence, BOOK_TAP_WINDOW } = await load('../src/components/bookTapSequence.ts')
const { BOOK_LIBRARY } = await load('../src/components/bookLibrary.ts')
function fixture() {
  let now = 0, next = 0
  const timers = new Map(), events = []
  const taps = new BookTapSequence(id => events.push(['invite', id]), id => events.push(['read', id]),
    (run, delay) => { const id = ++next;timers.set(id, { at: now + delay, run });return id }, id => timers.delete(id))
  function advance(to) { for (const [id, timer] of timers) if (timer.at <= to) { now = timer.at;timers.delete(id);timer.run() } now = to }
  return { taps, events, advance, tap: (id = 'book-1', x = 100, y = 100) => taps.tap(id, x, y, now) }
}
test('single click does nothing; double click invites only after the third-click window', () => {
  const f = fixture();f.tap();f.advance(400);assert.deepEqual(f.events, [])
  f.tap();f.advance(480);f.tap();f.advance(480 + BOOK_TAP_WINDOW - 1);assert.deepEqual(f.events, [])
  f.advance(480 + BOOK_TAP_WINDOW);assert.deepEqual(f.events, [['invite', 'book-1']])
})
test('triple click opens reading immediately and never starts a delayed invitation', () => {
  const f = fixture();f.tap();f.advance(70);f.tap();f.advance(150);f.tap();f.advance(1000)
  assert.deepEqual(f.events, [['read', 'book-1']])
})
test('different books, distant clicks, and slow clicks do not form a triple click', () => {
  for (const changed of ['id', 'position', 'time']) {
    const f = fixture();f.tap();f.advance(80);f.tap()
    f.advance(changed === 'time' ? 500 : 150)
    f.tap(changed === 'id' ? 'book-2' : 'book-1', changed === 'position' ? 130 : 100)
    f.advance(1000)
    assert(!f.events.some(e => e[0] === 'read'), changed)
  }
})
test('drag, blur, cancellation and unmount reset pending clicks', () => {
  const f = fixture();f.tap();f.advance(80);f.tap();f.taps.reset();f.advance(1000)
  assert.deepEqual(f.events, [])
  f.tap();f.advance(1100);f.tap();f.advance(1200);f.tap();assert.deepEqual(f.events, [['read', 'book-1']])
})
test('all ten persistent book IDs have distinct designs and three attributed original excerpts', () => {
  assert.equal(BOOK_LIBRARY.length, 10)
  assert.equal(new Set(BOOK_LIBRARY.map(b => b.cover)).size, 10)
  assert(new Set(BOOK_LIBRARY.map(b => b.binding)).size >= 5)
  BOOK_LIBRARY.forEach((book, i) => {
    assert.equal(book.id, `book-${i + 1}`)
    assert.equal(book.passages.length, 3)
    for (const p of book.passages) {
      assert(p.text.length >= 15 && p.chapter && book.author)
      assert(['zh.wikisource.org', 'ctext.org'].includes(new URL(p.source).hostname))
      assert(!/https?:|\[\[|生成/.test(p.text))
    }
  })
})
