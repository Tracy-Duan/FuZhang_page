import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTripoRequest, getTripoSettings, getTripoTaskStatus, isAllowedGeneratedAssetUrl, startTripoTask } from './tripo.mjs'

const environment = { TRIPO_API_KEY: 'test-key-not-a-real-secret' }
const front = 'https://example.com/front.png'
const back = 'https://example.com/back.webp'
const ok = (data) => new Response(JSON.stringify({ code: 0, data }), { status: 200 })

test('defaults preserve standard quality and expose no key', () => {
  const settings = getTripoSettings(environment)
  assert.equal(settings.model, 'v3.1-20260211')
  assert.equal(settings.inputMode, 'auto')
  assert.equal(settings.parameters.geometry_quality, 'standard')
  assert.equal(settings.parameters.texture_quality, 'standard')
  assert.equal(settings.parameters.pbr, true)
  assert.ok(!JSON.stringify(settings).includes(environment.TRIPO_API_KEY))
})

test('single-image request uses the official v3 schema, not DashScope fields', () => {
  const request = buildTripoRequest({ imageViews: { front }, prompt: 'unused image prompt' }, environment)
  assert.equal(request.path, '/generation/image-to-model')
  assert.equal(request.body.input, front)
  assert.equal(request.mode, 'single')
  assert.equal(request.body.enable_image_autofix, false)
  assert.ok(!('parameters' in request.body))
  assert.ok(!('prompt' in request.body))
})

test('legacy imageUrl request remains usable', () => {
  assert.equal(buildTripoRequest({ imageUrl: front }, environment).body.input, front)
})

test('auto multiview names views and preserves missing side-view positions', () => {
  const request = buildTripoRequest({ imageViews: { front, back } }, environment)
  assert.equal(request.path, '/generation/multiview-to-model')
  assert.deepEqual(request.body.inputs, [{ front }, { back }])
  assert.ok(!('input' in request.body))
})

test('forced single mode ignores side/back without dropping them from the original object', () => {
  const input = { imageViews: { front, back } }
  const request = buildTripoRequest(input, { ...environment, TRIPO_INPUT_MODE: 'single' })
  assert.equal(request.mode, 'single')
  assert.equal(request.body.input, front)
  assert.equal(input.imageViews.back, back)
})

test('forced multi requires front plus another view', () => {
  assert.throws(() => buildTripoRequest({ imageViews: { front } }, { TRIPO_INPUT_MODE: 'multi' }), /至少一张/)
  assert.throws(() => buildTripoRequest({ imageViews: { back } }, { TRIPO_INPUT_MODE: 'multi' }), /正面图/)
})

test('text fallback and explicit text mode omit image-only settings', () => {
  const request = buildTripoRequest({ prompt: '全身女性人台'.repeat(300) }, {
    ...environment, TRIPO_NEGATIVE_PROMPT: 'broken mesh', TRIPO_IMAGE_SEED: '0',
  })
  assert.equal(request.path, '/generation/text-to-model')
  assert.equal(Array.from(request.body.prompt).length, 1024)
  assert.equal(request.body.negative_prompt, 'broken mesh')
  assert.equal(request.body.image_seed, 0)
  assert.ok(!('orientation' in request.body))
  assert.ok(!('texture_alignment' in request.body))
  assert.ok(!('enable_image_autofix' in request.body))
  assert.equal(buildTripoRequest({ imageViews: { front }, prompt: 'human' }, { TRIPO_INPUT_MODE: 'text' }).mode, 'text')
})

test('invalid input is rejected before submitting a paid task', async () => {
  const noFetch = () => { throw new Error('should not submit') }
  for (const input of [null, [], {}, { imageUrl: 'file:///secret.png' }, { imageViews: { front: 'https://user:secret@example.com/a.png' } }]) {
    await assert.rejects(startTripoTask(input, environment, noFetch), (error) => error.statusCode === 400)
  }
})

test('advanced settings include zeros, face limit and the correct Ultra enum', () => {
  const settings = getTripoSettings({
    TRIPO_GEOMETRY_QUALITY: 'detailed', TRIPO_TEXTURE_QUALITY: 'extreme',
    TRIPO_FACE_LIMIT: '2000000', TRIPO_MODEL_SEED: '0', TRIPO_TEXTURE_SEED: '42',
    TRIPO_TEXTURE_VERSION: 'v3.5-20260815', TRIPO_DELIGHT: 'true', TRIPO_COMPRESS: 'geometry',
  })
  assert.equal(settings.parameters.geometry_quality, 'detailed')
  assert.equal(settings.parameters.face_limit, 2_000_000)
  assert.equal(settings.parameters.model_seed, 0)
  assert.equal(settings.parameters.texture_seed, 42)
  assert.equal(settings.parameters.delight, true)
  assert.equal(settings.parameters.compress, 'geometry')
})

test('invalid values, versions and conflicting settings fail locally', () => {
  for (const invalid of [
    { TRIPO_GEOMETRY_QUALITY: 'ultra' }, { TRIPO_INPUT_MODE: 'unknown' },
    { TRIPO_MODEL: 'Tripo/Tripo-H3.1' }, { TRIPO_PBR: 'yes' },
    { TRIPO_TEXTURE: 'false' }, { TRIPO_FACE_LIMIT: '-10' },
    { TRIPO_FACE_LIMIT: '1500001' }, { TRIPO_MODEL_SEED: '1.5' },
    { TRIPO_SMART_LOW_POLY: 'true', TRIPO_FACE_LIMIT: '30000' },
    { TRIPO_TEXTURE_QUALITY: 'fast' }, { TRIPO_DELIGHT: 'true' },
    { TRIPO_TEXTURE_VERSION: 'invalid' },
  ]) assert.throws(() => getTripoSettings(invalid), (error) => error.statusCode === 400)
  assert.throws(() => buildTripoRequest({ prompt: 'test' }, { TRIPO_NEGATIVE_PROMPT: 'a'.repeat(256) }), /255/)
  assert.equal(getTripoSettings({ TRIPO_TEXTURE_QUALITY: 'fast', TRIPO_TEXTURE_VERSION: 'v3.5-20260815' }).parameters.texture_quality, 'fast')
  assert.equal(getTripoSettings({ TRIPO_TEXTURE: 'false', TRIPO_PBR: 'false' }).parameters.texture, false)
})

test('submission sends only the Tripo key and returns a provider-prefixed task ID', async () => {
  let calls = 0
  const result = await startTripoTask({ imageUrl: front }, environment, async (url, init) => {
    calls += 1
    assert.equal(url, 'https://openapi.tripo3d.ai/v3/generation/image-to-model')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers.Authorization, `Bearer ${environment.TRIPO_API_KEY}`)
    assert.ok(!('X-DashScope-Async' in init.headers))
    assert.equal(JSON.parse(init.body).input, front)
    return ok({ task_id: 'task_example' })
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, { taskId: 'tripo:task_example', status: 'PENDING', provider: 'tripo', inputMode: 'single' })
})

test('missing key fails before any network call', async () => {
  await assert.rejects(startTripoTask({ imageUrl: front }, {}, () => { throw new Error('should not fetch') }),
    (error) => error.statusCode === 503 && error.message.includes('TRIPO_API_KEY'))
})

test('all official statuses map to existing frontend states', async () => {
  const states = { queued: 'PENDING', running: 'RUNNING', success: 'SUCCEEDED', failed: 'FAILED', cancelled: 'CANCELED' }
  for (const [status, expected] of Object.entries(states)) {
    const result = await getTripoTaskStatus('tripo:task_example', environment, async (url, init) => {
      assert.equal(url, 'https://openapi.tripo3d.ai/v3/tasks/task_example')
      assert.equal(init.method, 'GET')
      return ok({ status, progress: 30, output: { model_url: 'https://cdn.tripo3d.ai/model.glb', rendered_image_url: 'https://cdn.tripo3d.ai/preview.webp' } })
    })
    assert.equal(result.status, expected)
    assert.equal(result.taskId, 'tripo:task_example')
    assert.equal(result.progress, 30)
    assert.equal(result.modelUrl, 'https://cdn.tripo3d.ai/model.glb')
  }
})

test('failed task errors point to Tripo API credits, not the Qianwen console', async () => {
  const result = await getTripoTaskStatus('tripo:task_example', environment,
    async () => ok({ status: 'failed', error_code: 2010, error_message: 'Insufficient credits' }))
  assert.equal(result.status, 'FAILED')
  assert.match(result.error, /Tripo API 积分不足/)
})

test('success without a model URL fails clearly instead of showing an endless placeholder', async () => {
  const result = await getTripoTaskStatus('tripo:task_example', environment, async () => ok({ status: 'success' }))
  assert.equal(result.status, 'FAILED')
  assert.match(result.error, /没有返回模型文件/)
})

test('HTTP-200 business errors are not treated as successful submissions', async () => {
  let calls = 0
  await assert.rejects(startTripoTask({ imageUrl: front }, environment, async () => {
    calls += 1
    return new Response(JSON.stringify({ code: 2010, message: 'Insufficient credits' }), { status: 200 })
  }), (error) => error.statusCode === 402 && error.message.includes('积分不足'))
  assert.equal(calls, 1)
})

test('authentication and HTML responses provide clear errors', async () => {
  await assert.rejects(startTripoTask({ imageUrl: front }, environment,
    async () => new Response(JSON.stringify({ code: 1000, message: 'Invalid API key' }), { status: 401 })), /TRIPO_API_KEY/)
  await assert.rejects(startTripoTask({ imageUrl: front }, environment,
    async () => new Response('<html>not JSON</html>', { status: 200 })), /无法解析/)
  await assert.rejects(getTripoTaskStatus('tripo:task_example', environment,
    async () => new Response('<html>not found</html>', { status: 404 })), (error) => error.statusCode === 404)
})

test('unknown upstream errors never reflect the key to the browser', async () => {
  await assert.rejects(startTripoTask({ imageUrl: front }, environment,
    async () => new Response(JSON.stringify({ code: 9999, message: `bad ${environment.TRIPO_API_KEY}` }), { status: 400 })),
  (error) => !error.message.includes(environment.TRIPO_API_KEY) && error.message.includes('[已隐藏]'))
})

test('timeouts are not automatically retried or redirected to another paid provider', async () => {
  let calls = 0
  await assert.rejects(startTripoTask({ imageUrl: front }, environment, async () => {
    calls += 1
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
  }), (error) => error.statusCode === 504 && error.message.includes('避免重复'))
  assert.equal(calls, 1)
})

test('task ID path injection is rejected before the network call', async () => {
  await assert.rejects(getTripoTaskStatus('tripo:../../account', environment, () => { throw new Error('should not fetch') }), /任务 ID/)
})

test('new and old asset hosts are allowed without accepting spoofed domains', () => {
  for (const url of ['https://cdn.tripo3d.ai/model.glb', 'https://openapi.cdn.tripo3d.com/model.glb', 'https://tripo3d.ai/model.glb', 'https://example.aliyuncs.com/file.png', 'https://example.alicdn.com/file.png']) {
    assert.equal(isAllowedGeneratedAssetUrl(url), true, url)
  }
  for (const url of ['http://cdn.tripo3d.ai/model.glb', 'https://tripo3d.ai.evil.com/model.glb', 'https://eviltripo3d.ai/model.glb', 'https://localhost/model.glb', 'https://user:secret@cdn.tripo3d.ai/model.glb', 'https://cdn.tripo3d.ai:1234/model.glb', 'not a URL']) {
    assert.equal(isAllowedGeneratedAssetUrl(url), false, url)
  }
})

test('retired design and generation HTTP routes return 410 without upstream calls', async () => {
  const { authenticatedApi: handleApi } = await import('./test-auth-fixture.mjs')
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('Unexpected upstream request') }
  try {
    for (const [method, url] of [['POST', '/api/design'], ['POST', '/api/image'], ['POST', '/api/3d/start'], ['GET', '/api/3d/status?taskId=legacy-task'], ['GET', '/api/asset?url=https://cdn.tripo3d.ai/mock.glb']]) {
      let status, body = ''
      const req = { method, url, headers: { host: 'localhost' } }
      const res = { writeHead(value) { status = value }, end(value) { body += value || '' } }
      await handleApi(req, res)
      assert.equal(status, 410, url)
      assert.match(JSON.parse(body).error, /已停用/)
    }
    assert.equal(calls, 0)
  } finally { globalThis.fetch = previousFetch }
})
