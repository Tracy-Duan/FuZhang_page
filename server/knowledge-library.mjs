import { createHash } from 'node:crypto'
import { getHanfuBrowseCorpus } from './rag.mjs'
import { Converter } from 'opencc-js/t2cn'
import { loadLibraryRows } from './library-archive.mjs'

export const simplifyChinese = Converter({ from: 't', to: 'cn' })
const displayFields = new Set(['title', 'kind', 'source', 'cite', 'dynasties', 'tags', 'excerpt', 'originalTitle', 'authors', 'date', 'license', 'attribution', 'limits', 'heading', 'text', 'reviewNote'])
function simplifiedDisplay(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, !displayFields.has(key) ? value
    : Array.isArray(value) ? value.map(item => typeof item === 'string' ? simplifyChinese(item) : item)
    : typeof value === 'string' ? simplifyChinese(value) : value]))
}

export const libraryCategories = ['forms', 'stories', 'research']
const indexes = new WeakMap()
const collator = new Intl.Collator('zh-CN', { numeric: true })
const normalize = value => simplifyChinese(String(value || '')).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const unique = values => [...new Set(values.filter(Boolean))]
const safeUrl = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '' } catch { return '' }
}

function categoriesFor(row) {
  if (row.layer === 'research') return ['research']
  if (row.layer === 'guji') return ['forms', 'stories']
  if (row.layer === 'museum' || row.layer === 'bift') return ['forms']
  const subject = normalize([row.title, row.section, ...(row.tags || [])].join(' '))
  const categories = []
  if (/形制|服制|领|襟|袖|袍|衫|裙|裳|襦|冠|帽|巾|履|鞋|褙|织|纹|锦|绣|材料/.test(subject)) categories.push('forms')
  if (/研究|考据|考证|文献|论文|争议|辨析|标准|考古|报告|著作|学者/.test(subject)) categories.push('research')
  return categories.length ? categories : ['stories']
}

function buildIndex(rows) {
  const groups = new Map(libraryCategories.map(category => [category, new Map()]))
  for (const row of rows) {
    const sourceId = row.meta?.source_document_id || row.url || row.pid
    for (const category of categoriesFor(row)) {
      const documents = groups.get(category)
      // Keep existing verified deep links, and keep unreviewed records distinct.
      const key = row.browseStatus === 'verified' ? sourceId : `${row.browseStatus}:${sourceId}`
      if (!documents.has(key)) documents.set(key, [])
      documents.get(key).push(row)
    }
  }
  const result = new Map()
  for (const [category, documents] of groups) {
    const articles = [...documents.entries()].map(([key, passages]) => {
      const first = passages[0], meta = first.meta || {}
      const title = category === 'research' ? first.title.split('·')[0].trim() : first.title
      const article = simplifiedDisplay({
        id: createHash('sha256').update(`${category}:${key}`).digest('hex').slice(0, 20),
        category, title, kind: first.kind || '', layer: first.layer,
        source: first.source || meta.institution || meta.publisher || '',
        url: safeUrl(first.url), cite: first.cite || '', grade: first.grade || '',
        dynasties: unique(passages.map(row => row.dynasty)),
        tags: unique(passages.flatMap(row => row.tags || [])).slice(0, 16),
        excerpt: first.text.replace(/\s+/g, ' ').trim().slice(0, 180),
        passageCount: passages.length, language: meta.language || 'zh',
        originalTitle: meta.original_title || '', authors: meta.authors || [],
        date: meta.date || meta.date_display || '', doi: meta.doi || '',
        license: meta.license || '', licenseUrl: safeUrl(meta.license_url),
        attribution: meta.attribution || '', limits: meta.limits || '',
        status: first.browseStatus, reviewNote: unique(passages.map(row => row.browseNote)).join(' '),
      })
      return { article, passages, search: normalize([title, article.originalTitle, article.cite, ...article.tags, ...passages.map(row => row.text)].join(' ')) }
    })
    articles.sort((a, b) => {
      const priority = article => {
        if (category === 'forms') return article.layer === 'museum' ? 1 : /衣服|深衣|玉藻|釋|释|說文|说文|冠服|舆服|輿服/.test(article.title) ? 0 : 2
        if (category === 'stories') return /夢|梦|武林|歲時|岁时|世說|世说|風俗|风俗|酉陽|酉阳/.test(article.title) ? 0 : 1
        return 0
      }
      const statusPriority = { verified: 0, pending: 1, archived: 2 }
      const difference = statusPriority[a.article.status] - statusPriority[b.article.status] || priority(a.article) - priority(b.article)
      if (difference) return difference
      return collator.compare(a.article.title, b.article.title)
    })
    result.set(category, articles)
  }
  return { categories: result, coverage: {
    totalPassages: rows.length,
    includedPassages: new Set([...groups.values()].flatMap(documents => [...documents.values()].flat().map(row => row.pid))).size,
    statusCounts: Object.fromEntries(['verified', 'archived', 'pending'].map(status => [status, rows.filter(row => row.browseStatus === status).length])),
  } }
}

function pageNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

export async function browseHanfuLibrary(options = {}) {
  const category = options.category || 'forms'
  if (!libraryCategories.includes(category)) throw Object.assign(new Error('栏目不存在'), { statusCode: 400 })
  const corpus = await getHanfuBrowseCorpus()
  if (!corpus.available) throw Object.assign(new Error('知识库暂时无法读取，请稍后重试。'), { statusCode: 503 })
  let indexPromise = indexes.get(corpus.passages)
  if (!indexPromise) {
    indexPromise = loadLibraryRows(corpus.passages).then(buildIndex).catch(error => { indexes.delete(corpus.passages); throw error })
    indexes.set(corpus.passages, indexPromise)
  }
  const { categories: index, coverage } = await indexPromise
  const documents = index.get(category)
  const status = options.status || 'all'
  if (!['all', 'verified', 'archived', 'pending'].includes(status)) throw Object.assign(new Error('资料状态无效'), { statusCode: 400 })
  if (options.id) {
    const document = documents.find(item => item.article.id === options.id)
    if (!document) throw Object.assign(new Error('这份资料尚未收录在此栏目中。'), { statusCode: 404 })
    const pageSize = 16, total = document.passages.length
    const page = Math.min(pageNumber(options.page, 1), Math.max(1, Math.ceil(total / pageSize)))
    return {
      article: document.article, page, pageSize, total,
      passages: document.passages.slice((page - 1) * pageSize, page * pageSize).map(row => simplifiedDisplay({
        id: row.pid, heading: row.meta?.heading || row.title, text: row.text,
        cite: row.cite || '', url: safeUrl(row.url),
        license: row.meta?.license || '', licenseUrl: safeUrl(row.meta?.license_url),
        attribution: row.meta?.attribution || '', limits: row.meta?.limits || '',
        status: row.browseStatus, reviewNote: row.browseNote,
      })),
    }
  }
  const query = normalize(options.query).slice(0, 100)
  const dynasty = simplifyChinese(String(options.dynasty || '')).slice(0, 40)
  const terms = query.split(' ').filter(Boolean)
  const filtered = documents.filter(item => (status === 'all' || item.article.status === status) && (!dynasty || item.article.dynasties.includes(dynasty)) && terms.every(term => item.search.includes(term)))
  const pageSize = 12, total = filtered.length
  const page = Math.min(pageNumber(options.page, 1), Math.max(1, Math.ceil(total / pageSize)))
  return {
    category, query, dynasty, status, page, pageSize, total, coverage,
    passageTotal: filtered.reduce((sum, item) => sum + item.passages.length, 0),
    counts: Object.fromEntries(libraryCategories.map(key => [key, index.get(key).length])),
    dynasties: unique(documents.flatMap(item => item.article.dynasties)).sort(collator.compare),
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map(({ article }) => ({
      id: article.id, category, title: article.title, kind: article.kind,
      source: article.source, layer: article.layer, dynasties: article.dynasties,
      tags: article.tags.slice(0, 5), excerpt: article.excerpt,
      passageCount: article.passageCount, language: article.language,
      status: article.status, reviewNote: article.reviewNote,
    })),
  }
}
