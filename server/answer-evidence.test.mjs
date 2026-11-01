import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { finalizeEvidence, localEvidenceMarkers, unresolvedEvidenceMarkers } from './answer-evidence.mjs'

const localA = { title: '本地甲', url: 'https://example.com/a', origin: 'local' }
const localB = { title: '本地乙', url: 'https://example.com/b', origin: 'local' }
const web = { title: '网页甲', url: 'https://example.com/web', citationIndex: 1, origin: 'web' }
const source = readFileSync(new URL('../src/citations.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { citedSources, resolveCitationMarkers } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))

test('local evidence keeps all retrieval records while only the used fact gets an inline citation', () => {
  const result = finalizeEvidence('证据[local_2]。', [localA, localB])
  assert.deepEqual(result.sources, [localA, localB])
  assert.equal(result.answer, `证据[2](${localB.url})。`)
  assert.deepEqual(citedSources(result.answer, result.sources), [localB])
})
test('web and local index 1 never cross-reference, including inside a table', () => {
  const answer = '| 对象 | 依据 |\n| --- | --- |\n| 古籍 | 甲[local_1] |\n| 网页 | 乙[ref_1] |'
  const result = finalizeEvidence(answer, [localA, localB, web])
  assert.match(result.answer, /甲\[1\]\(https:\/\/example.com\/a\)/)
  assert.match(result.answer, /乙\[3\]\(https:\/\/example.com\/web\)/)
  assert.deepEqual(result.sources, [localA, localB, web])
  assert.equal(resolveCitationMarkers(answer, [localA, localB, web]), result.answer)
})
test('web-only markers and duplicate URLs produce one correctly numbered source', () => {
  const result = finalizeEvidence('网络[ref_1]，再次[ref_1]。', [web, { ...web }])
  assert.equal(result.sources.length, 1)
  assert.equal((result.answer.match(/\[1\]/g) || []).length, 2)
})
test('unknown markers vanish without attaching evidence to unrelated text', () => {
  const result = finalizeEvidence('不确定[ref_99][local_99]。', [localA, web])
  assert.equal(result.answer, '不确定。')
  assert.deepEqual(result.sources, [localA, web])
  assert.match(result.citationWarning, /未能匹配/)
  assert.deepEqual(citedSources('没有引用的回答。', [localA, web]), [])
})
test('legacy local and linked citations survive migration and are renumbered consistently', () => {
  assert.equal(localEvidenceMarkers('[1] 甲\n[2] 乙'), '[local_1] 甲\n[local_2] 乙')
  assert.equal(finalizeEvidence('乙[2]。', [localA, localB]).answer, `乙[2](${localB.url})。`)
  const result = finalizeEvidence(`乙[local_2]，网页[9](${web.url})。`, [localA, localB, web])
  assert.deepEqual(result.sources, [localA, localB, web])
  assert.equal(result.answer, `乙[2](${localB.url})，网页[3](${web.url})。`)
})

test('ambiguous bare mixed or web numbers never guess a local or reordered web source', () => {
  const answer = '甲[1]，乙[2]。'
  assert.deepEqual(unresolvedEvidenceMarkers(answer, [localA, web]), ['[1]', '[2]'])
  assert.deepEqual(finalizeEvidence(answer, [localA, web]).sources, [localA, web])
  assert.equal(resolveCitationMarkers(answer, [localA, web]), '甲，乙。')
  assert.deepEqual(unresolvedEvidenceMarkers('来源[ref_99]，已知[local_1]。', [localA, web]), ['[ref_99]'])
})

test('unreturned or filtered website links cannot masquerade as validated citations', () => {
  const bad = '[来源](https://www.sohu.com/untrusted)'
  assert.deepEqual(unresolvedEvidenceMarkers(`已知[来源](${web.url})，错误${bad}。`, [web]), [bad])
})

test('Responses URL-only sources use exact links, including candidates beyond the eighth result', () => {
  const candidates = Array.from({ length: 14 }, (_, i) => ({ title: `网页${i}`, url: `https://museum.example/${i}` }))
  const answer = `表格依据[来源](${candidates[13].url})，另见[藏品页](${candidates[1].url})。`
  const result = finalizeEvidence(answer, candidates)
  assert.deepEqual(result.sources, candidates)
  assert.equal(result.answer, `表格依据[14](${candidates[13].url})，另见[2](${candidates[1].url})。`)
  assert.deepEqual(citedSources(answer, candidates), [candidates[1], candidates[13]])
  assert.equal(resolveCitationMarkers(answer, candidates), result.answer)
})

test('uncited RAG and web records survive; duplicate URL retains both origins and its excerpts', () => {
  const result = finalizeEvidence('无角标的完整正文。', [localA, { ...localA, origin: 'web', excerpt: '网页摘录' }, web])
  assert.equal(result.answer, '无角标的完整正文。')
  assert.equal(result.sources.length, 2)
  assert.deepEqual(result.sources[0].origins, ['local', 'web'])
  assert.equal(result.sources[0].excerpt, '网页摘录')
  assert.match(result.citationWarning, /未标注具体出处/)
  const invalid = finalizeEvidence('结论[来源](https://not-retrieved.example/)。', [web])
  assert.equal(invalid.answer, '结论（出处待核对）。')
  assert.deepEqual(invalid.sources, [web])
})

test('same URL local excerpts share a citation without losing the first excerpt', () => {
  const a = { ...localA, excerpt: '第一段' }, b = { ...localA, excerpt: '第二段' }
  const answer = '甲[local_1]，乙[local_2]。'
  const result = finalizeEvidence(answer, [a, b])
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].excerpt, '第一段\n\n第二段')
  assert.equal(resolveCitationMarkers(answer, [a, b]), result.answer)
})
