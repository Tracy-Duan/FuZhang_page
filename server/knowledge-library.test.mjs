import { corpusDirectory } from './test-corpus-fixture.mjs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { browseHanfuLibrary, simplifyChinese } from './knowledge-library.mjs'
import { getHanfuBrowseCorpus } from './rag.mjs'
import { authenticatedApi as handleApi } from './test-auth-fixture.mjs'
import { loadLibraryRows } from './library-archive.mjs'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

test('three public columns include the reviewed corpus grouped by stable source IDs', async () => {
  const corpus = await getHanfuBrowseCorpus()
  assert(corpus.available)
  const results = await Promise.all(['forms', 'stories', 'research'].map(category => browseHanfuLibrary({ category })))
  for (const data of results) {
    assert(data.total > 0)
    assert(data.items.length <= 12)
    assert.equal(new Set(data.items.map(item => item.id)).size, data.items.length)
    const second = await browseHanfuLibrary({ category: data.category, page: 2 })
    if (data.total > 12) assert(second.items.every(item => !data.items.some(first => first.id === item.id)))
    else assert.equal(second.page, 1)
  }
  assert(results[1].items.every(item => item.layer === 'guji'))
  assert(results[2].items.every(item => item.layer === 'research'))
  const verifiedResearch = await browseHanfuLibrary({ category: 'research', status: 'verified' })
  assert.equal(verifiedResearch.total, new Set(corpus.passages.filter(row => row.layer === 'research').map(row => row.meta.source_document_id)).size)
  assert.deepEqual(results[0].coverage.statusCounts, { verified: 30, archived: 0, pending: 0 })
  assert.equal(results[0].coverage.totalPassages, 30)
  assert.equal(results[0].coverage.includedPassages, 30)
  assert.deepEqual(results[0].counts, results[1].counts)
})

test('public browsing never imports private quarantine or staging records', async () => {
  const corpus = await getHanfuBrowseCorpus()
  const activeFile = path.join(corpusDirectory, 'passages.jsonl')
  const digest = async () => createHash('sha256').update(await readFile(activeFile)).digest('hex')
  const before = await digest()
  const rows = await loadLibraryRows(corpus.passages)
  assert.equal(rows.length, corpus.passages.length)
  assert(rows.every(row => row.browseStatus === 'verified'))
  for (const category of ['forms', 'stories', 'research']) {
    for (const status of ['archived', 'pending']) {
      const result = await browseHanfuLibrary({ category, status })
      assert.equal(result.total, 0)
      assert.deepEqual(result.items, [])
    }
  }
  assert.equal(await digest(), before)
  await assert.rejects(browseHanfuLibrary({ category: 'forms', status: 'invalid' }), { statusCode: 400 })
})

test('detail displays simplified text and preserves source IDs, URLs and license without changing the corpus', async () => {
  const corpus = await getHanfuBrowseCorpus()
  const list = await browseHanfuLibrary({ category: 'research' })
  const detail = await browseHanfuLibrary({ category: 'research', id: list.items[0].id })
  assert(detail.article.attribution)
  assert(detail.article.license)
  assert.match(detail.article.url, /^https?:\/\//)
  assert(detail.article.limits)
  for (const passage of detail.passages) {
    const original = corpus.passages.find(row => row.pid === passage.id)
    assert.equal(passage.text, simplifyChinese(original.text))
    assert.equal(passage.attribution, simplifyChinese(original.meta.attribution))
    assert.equal(passage.license, simplifyChinese(original.meta.license))
    assert.equal(passage.url, new URL(original.url).href)
  }
  assert(!JSON.stringify(detail).includes('source_proof'))
  assert(!JSON.stringify(detail).includes('dataDirectory'))
  const invalid = await browseHanfuLibrary({ category: 'research', id: list.items[0].id, page: 1e20 })
  assert.equal(invalid.page, Math.ceil(detail.total / detail.pageSize))
})

test('all columns simplify Chinese display and search while keeping original evidence untouched', async () => {
  assert.equal(simplifyChinese('東京夢華錄：衣領與紋樣，漢語研究。English DOI'), '东京梦华录：衣领与纹样，汉语研究。English DOI')
  const corpus = await getHanfuBrowseCorpus()
  const before = JSON.stringify(corpus.passages)
  for (const category of ['forms', 'stories', 'research']) {
    const list = await browseHanfuLibrary({ category })
    for (const item of list.items) {
      for (const value of [item.title, item.excerpt, ...item.tags, ...item.dynasties]) assert.equal(value, simplifyChinese(value))
      const detail = await browseHanfuLibrary({ category, id: item.id })
      for (const passage of detail.passages) {
        for (const value of [passage.text, passage.heading, passage.cite, passage.attribution]) assert.equal(value, simplifyChinese(value))
      }
    }
  }
  const traditional = await browseHanfuLibrary({ category: 'stories', query: '東京夢華錄' })
  const simplified = await browseHanfuLibrary({ category: 'stories', query: '东京梦华录' })
  assert(simplified.total > 0)
  assert.deepEqual(simplified.items, traditional.items)
  assert.equal(JSON.stringify(corpus.passages), before)
})

test('search reaches excerpt bodies, dynasty filters match and empty results remain explicit', async () => {
  const list = await browseHanfuLibrary({ category: 'stories' })
  const detail = await browseHanfuLibrary({ category: 'stories', id: list.items[0].id })
  const query = detail.passages[0].text.slice(40, 58).replace(/\s+/g, '')
  const found = await browseHanfuLibrary({ category: 'stories', query })
  assert(found.items.some(item => item.id === detail.article.id))
  const dynasty = list.items[0].dynasties[0]
  const filtered = await browseHanfuLibrary({ category: 'stories', dynasty })
  assert(filtered.items.length)
  assert(filtered.items.every(item => item.dynasties.includes(dynasty)))
  const empty = await browseHanfuLibrary({ category: 'forms', query: '不存在的资料_qa_9192' })
  assert.equal(empty.total, 0)
  assert.deepEqual(empty.items, [])
  assert.equal((await browseHanfuLibrary({ category: 'research', page: -20 })).page, 1)
  await assert.rejects(browseHanfuLibrary({ category: 'invalid' }), { statusCode: 400 })
  await assert.rejects(browseHanfuLibrary({ category: 'forms', id: 'unknown' }), { statusCode: 404 })
})

test('authenticated HTTP browsing needs no model calls and handles invalid categories and IDs', async () => {
  const server = createServer((req, res) => { void handleApi(req, res) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const response = await fetch(`${base}/api/knowledge?category=forms`)
    assert.equal(response.status, 200)
    const list = await response.json()
    const detail = await fetch(`${base}/api/knowledge?category=forms&id=${list.items[0].id}`)
    assert.equal(detail.status, 200)
    assert((await detail.json()).passages.length)
    assert.equal((await fetch(`${base}/api/knowledge?category=nope`)).status, 400)
    const archived = await fetch(`${base}/api/knowledge?category=stories&status=archived`).then(response => response.json())
    assert(archived.items.every(item => item.status === 'archived'))
    assert.equal(archived.coverage.includedPassages, 30)
    assert.equal((await fetch(`${base}/api/knowledge?category=forms&id=nope`)).status, 404)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
