import test from 'node:test'
import assert from 'node:assert/strict'
import { applyWebSearchPreference, resolveEvidenceRoute } from './chat-routing.mjs'

const localPlan = { useRag: true, useWeb: false }
const hits = { used: true, hits: [{ passage: { text: '明代马面裙概述' } }] }
const missing = { used: false, hits: [] }
const neverReview = () => { throw new Error('review must not run') }

test('web switch blocks every automatic fallback when off and explicitly searches when on', async () => {
  for (const flag of [undefined, false, 'true', 1]) {
    const plan = applyWebSearchPreference({ useRag: false, useWeb: true, webPolicy: 'auto' }, flag)
    assert.equal(plan.useWeb, false)
    assert.equal(plan.useRag, true)
    assert.equal(plan.webPolicy, 'local_only')
    for (const rag of [missing, hits]) {
      for (const review of [async () => ({ sufficient: false }), async () => { throw new Error('timeout') }]) {
        assert.notEqual((await resolveEvidenceRoute(plan, rag, review)).mode, 'search')
      }
    }
  }
  const enabled = applyWebSearchPreference({ useRag: true, useWeb: false, webPolicy: 'local_only' }, true)
  assert.equal((await resolveEvidenceRoute(enabled, hits, neverReview)).mode, 'search')
})

test('empty or unavailable local evidence falls back to web instead of direct answering', async () => {
  for (const rag of [missing, { used: true, hits: [] }]) {
    assert.equal((await resolveEvidenceRoute(localPlan, rag, neverReview)).mode, 'search')
  }
})

test('keyword hits without comparison evidence also fall back, sufficient excerpts stay local', async () => {
  const insufficient = await resolveEvidenceRoute(localPlan, hits, async () => ({ sufficient: false, reason: '缺少清代和褶裥方向的证据。' }))
  assert.equal(insufficient.mode, 'search')
  assert.match(insufficient.reason, /缺少清代/)
  assert.equal((await resolveEvidenceRoute(localPlan, hits, async () => ({ sufficient: true }))).mode, 'rag')
})

test('invalid, timed out and failed evidence reviews safely request a web check', async () => {
  for (const review of [async () => ({}), async () => ({ sufficient: 'true' }), async () => { throw new Error('timeout') }]) {
    assert.equal((await resolveEvidenceRoute(localPlan, hits, review)).mode, 'search')
  }
})

test('greetings and already selected web routes do not pay for an evidence review', async () => {
  assert.equal((await resolveEvidenceRoute({ useRag: false, useWeb: false }, missing, neverReview)).mode, 'direct')
  assert.equal((await resolveEvidenceRoute({ ...localPlan, useWeb: true }, hits, neverReview)).mode, 'search')
})

test('explicit local-only policy prevents automatic web and states the evidence boundary', async () => {
  const plan = { ...localPlan, webPolicy: 'local_only' }
  const result = await resolveEvidenceRoute(plan, missing, neverReview)
  assert.equal(result.mode, 'direct')
  assert.match(result.reason, /仅使用本地资料/)
  assert.equal((await resolveEvidenceRoute(plan, hits, async () => ({ sufficient: false }))).mode, 'rag')
})
