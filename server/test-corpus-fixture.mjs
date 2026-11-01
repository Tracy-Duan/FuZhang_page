// Artificial test data, unrelated to the private research corpus.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { after } from 'node:test'
export const corpusDirectory = mkdtempSync(path.join(tmpdir(), 'fuzhang-synthetic-corpus-'))
export const syntheticRows = Array.from({ length: 30 }, (_, index) => ({
  ...{ layer: ['guji', 'museum', 'research'][index] || 'guji' },
  pid: `synthetic-${index}`, kind: '测试记录', title: index === 0 ? '东京梦华录测试占位' : index < 3 ? `虚构样例服饰 Synthetic marker ${index}` : `虚构记录${index}`,
  text: '这段文字完全由测试程序虚构，仅检查界面搜索与引用字段。不是历史资料，不可用于史实回答。测试内容包含足够多的字符，以验证选段搜索功能。',
  dynasty: '宋', tags: index > 0 && index < 3 ? ['样例服饰'] : ['测试'], cite: '虚构测试来源', source: '测试程序', url: `https://example.com/synthetic/${index > 0 && index < 3 ? 1 : index}`,
  meta: { source_document_id: `synthetic-source-${index}`, curation_status: 'source_verified', license: 'MIT', attribution: 'Synthetic fixture author', limits: '仅测试，不是史料' },
}))
const passages = syntheticRows.map(JSON.stringify).join('\n') + '\n'
const terms = JSON.stringify({ '样例服饰': [] })
const digest = value => createHash('sha256').update(value).digest('hex')
writeFileSync(path.join(corpusDirectory, 'passages.jsonl'), passages)
writeFileSync(path.join(corpusDirectory, 'term_index.json'), terms)
writeFileSync(path.join(corpusDirectory, 'corpus-policy.json'), JSON.stringify({ schema: 'clean-rag-v1', status: 'active', allow_layers: ['guji', 'museum', 'research'], passage_count: 30, passage_sha256: digest(passages), term_index_sha256: digest(terms) }))
writeFileSync(path.join(corpusDirectory, 'quotes.json'), '[]')
process.env.HANFU_RAG_DATA_DIR = corpusDirectory
process.env.HANFU_COMPANION_QUOTES_FILE = path.join(corpusDirectory, 'quotes.json')
after(() => { rmSync(corpusDirectory, { recursive: true, force: true }) })
