import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'

async function loadApi(entry) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })
  const compiled = new Module(fileURLToPath(import.meta.url))
  compiled._compile(result.outputFiles[0].text, fileURLToPath(import.meta.url))
  return compiled.exports
}
const routes = await loadApi('../src/components/library/libraryRoutes.ts')
const hashes = await loadApi('../src/library.ts')

test('opening a result and returning preserves the full search context and list page', () => {
  const original = { category: 'forms', query: '深衣', dynasty: '宋', status: 'archived', page: 37 }
  const opened = routes.articleRoute(original, '347a15b2809a657c10e1', original.page)
  const shared = hashes.parseLibraryRoute(hashes.libraryHash({ ...opened, page: 2 }))
  assert.equal(shared.page, 2)
  assert.deepEqual(routes.returnToResults(shared), original)
  assert.equal(hashes.parseLibraryRoute('#library/forms?from=37').listPage, undefined)
  for (const from of ['NaN', 'Infinity', '-3', '2.5']) assert.equal(hashes.parseLibraryRoute(`#library/forms/347a15b2809a657c10e1?from=${from}`).listPage, undefined)
})
test('pagination exposes stable endpoints and nearby pages for large catalogs', () => {
  for (const total of [1, 2, 5, 20, 277, 1000]) for (let page = 1; page <= total; page++) {
    const items = routes.paginationItems(page, total), numbers = items.filter(value => typeof value === 'number')
    assert(numbers.includes(1)); assert(numbers.includes(total)); assert(numbers.includes(page))
    assert.deepEqual(numbers, [...new Set(numbers)].sort((a, b) => a - b))
    assert(items.length <= 9)
    assert(items[0] !== 'gap' && items.at(-1) !== 'gap')
  }
  assert.deepEqual(routes.paginationItems(1, 277), [1, 2, 3, 4, 'gap', 277])
})
test('display headings retain their topic without duplicating the entire article title', () => {
  assert.equal(routes.passageLabel('《尔雅注疏》·卷05｜交领、深衣'), '交领、深衣')
  assert.equal(routes.passageLabel('A research excerpt'), 'A research excerpt')
})
