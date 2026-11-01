const baseUrl = 'https://openapi.tripo3d.ai/v3'
const taskPrefix = 'tripo:'
const latestTextureVersion = 'v3.5-20260815'
const viewNames = ['front', 'left', 'back', 'right']

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function value(environment, name, fallback = '') {
  return String(environment[name] ?? fallback).trim() || fallback
}

function choice(environment, name, fallback, choices) {
  const selected = value(environment, name, fallback)
  if (!choices.includes(selected)) throw fail(`${name} 配置不正确，可选：${choices.join('、')}`)
  return selected
}

function boolean(environment, name, fallback) {
  const selected = value(environment, name, String(fallback)).toLowerCase()
  if (selected === 'true') return true
  if (selected === 'false') return false
  throw fail(`${name} 只能填写 true 或 false`)
}

function optionalInteger(environment, name, minimum, maximum) {
  const selected = value(environment, name)
  if (!selected) return undefined
  const number = Number(selected)
  if (!/^\d+$/.test(selected) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw fail(`${name} 必须是 ${minimum} 到 ${maximum} 之间的整数`)
  }
  return number
}

// Only public settings are returned here. Never include the API key in health responses.
export function getTripoSettings(environment = process.env) {
  const model = choice(environment, 'TRIPO_MODEL', 'v3.1-20260211', ['v3.1-20260211', 'v3.0-20250812'])
  const inputMode = choice(environment, 'TRIPO_INPUT_MODE', 'auto', ['auto', 'single', 'multi', 'text'])
  const parameters = {
    geometry_quality: choice(environment, 'TRIPO_GEOMETRY_QUALITY', 'standard', ['standard', 'detailed']),
    texture_quality: choice(environment, 'TRIPO_TEXTURE_QUALITY', 'standard', ['standard', 'detailed', 'extreme', 'fast']),
    texture: boolean(environment, 'TRIPO_TEXTURE', true),
    pbr: boolean(environment, 'TRIPO_PBR', true),
    texture_alignment: choice(environment, 'TRIPO_TEXTURE_ALIGNMENT', 'original_image', ['original_image', 'geometry']),
    orientation: choice(environment, 'TRIPO_ORIENTATION', 'default', ['default', 'align_image']),
    auto_size: boolean(environment, 'TRIPO_AUTO_SIZE', false),
    smart_low_poly: boolean(environment, 'TRIPO_SMART_LOW_POLY', false),
    export_uv: boolean(environment, 'TRIPO_EXPORT_UV', true),
  }
  if (parameters.pbr && !parameters.texture) {
    throw fail('TRIPO_PBR=true 时必须开启 TRIPO_TEXTURE；生成白模请将两者同时设为 false')
  }

  const textureVersion = value(environment, 'TRIPO_TEXTURE_VERSION')
  if (textureVersion) {
    parameters.texture_version = choice(environment, 'TRIPO_TEXTURE_VERSION', '', ['v3.0-20250812', latestTextureVersion])
  }
  if (parameters.texture_quality === 'fast' && textureVersion !== latestTextureVersion) {
    throw fail(`TRIPO_TEXTURE_QUALITY=fast 时必须设置 TRIPO_TEXTURE_VERSION=${latestTextureVersion}`)
  }
  if (value(environment, 'TRIPO_DELIGHT')) {
    if (textureVersion !== latestTextureVersion) throw fail(`TRIPO_DELIGHT 仅支持 TRIPO_TEXTURE_VERSION=${latestTextureVersion}`)
    parameters.delight = boolean(environment, 'TRIPO_DELIGHT', true)
  }

  const maximumFaces = parameters.smart_low_poly ? 20_000
    : parameters.geometry_quality === 'detailed' ? 2_000_000
      : model === 'v3.1-20260211' ? 1_500_000 : 1_000_000
  const faceLimit = optionalInteger(environment, 'TRIPO_FACE_LIMIT', parameters.smart_low_poly ? 500 : 1, maximumFaces)
  if (faceLimit !== undefined) parameters.face_limit = faceLimit
  for (const [name, field] of [['TRIPO_MODEL_SEED', 'model_seed'], ['TRIPO_TEXTURE_SEED', 'texture_seed']]) {
    const seed = optionalInteger(environment, name, 0, 2_147_483_647)
    if (seed !== undefined) parameters[field] = seed
  }
  if (value(environment, 'TRIPO_COMPRESS')) {
    parameters.compress = choice(environment, 'TRIPO_COMPRESS', '', ['geometry'])
  }
  return { provider: 'tripo', model, inputMode, parameters }
}

function imageUrl(input) {
  if (typeof input !== 'string' || !input.trim()) return ''
  try {
    const parsed = new URL(input.trim())
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return ''
    return parsed.href
  } catch {
    return ''
  }
}

export function buildTripoRequest(input = {}, environment = process.env) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('3D 请求必须是 JSON 对象')
  const settings = getTripoSettings(environment)
  const views = input.imageViews && typeof input.imageViews === 'object' && !Array.isArray(input.imageViews)
    ? input.imageViews : { front: input.imageUrl }
  const front = imageUrl(views.front)
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  const images = viewNames.flatMap((name) => imageUrl(views[name]) ? [{ [name]: imageUrl(views[name]) }] : [])
  const mode = settings.inputMode
  if (views.front && !front && mode !== 'text') throw fail('正面参考图地址不正确，请使用可公网访问的 HTTP / HTTPS 图片直链')
  const useMulti = mode === 'multi' || (mode === 'auto' && front && images.length >= 2)
  const body = { model: settings.model, ...settings.parameters }

  if (useMulti) {
    if (!front || images.length < 2) throw fail('多图生成需要正面图和至少一张侧面或背面图')
    // Named views avoid accidentally treating a missing left view as a back/right view.
    return { path: '/generation/multiview-to-model', body: { ...body, inputs: images }, mode: 'multi' }
  }
  if (mode === 'single' || (mode === 'auto' && front)) {
    if (!front) throw fail('单图生成需要正面参考图')
    return {
      path: '/generation/image-to-model',
      body: { ...body, input: front, enable_image_autofix: boolean(environment, 'TRIPO_IMAGE_AUTOFIX', false) },
      mode: 'single',
    }
  }
  if (!prompt) throw fail('缺少图片地址或 3D 提示词')
  const textBody = { ...body, prompt: Array.from(prompt).slice(0, 1024).join('') }
  // Image-only controls must not be sent to text-to-model.
  delete textBody.orientation
  delete textBody.texture_alignment
  const negativePrompt = value(environment, 'TRIPO_NEGATIVE_PROMPT')
  if (Array.from(negativePrompt).length > 255) throw fail('TRIPO_NEGATIVE_PROMPT 最多 255 个字符')
  if (negativePrompt) textBody.negative_prompt = negativePrompt
  const imageSeed = optionalInteger(environment, 'TRIPO_IMAGE_SEED', 0, 2_147_483_647)
  if (imageSeed !== undefined) textBody.image_seed = imageSeed
  return { path: '/generation/text-to-model', body: textBody, mode: 'text' }
}

export function explainTripoError(code, message, httpStatus = 0) {
  const text = String(message || '').toLowerCase()
  const number = Number(code)
  if ([1000, 1001].includes(number) || httpStatus === 401) {
    return 'Tripo API Key 无效或未授权，请检查 .env.local 中的 TRIPO_API_KEY（不是千问的 Key）'
  }
  if (number === 2010 || /insufficient|balance|credits|quota/.test(text)) {
    return 'Tripo API 积分不足，请到 Tripo 开发者平台充值 API 积分；Studio 网页会员积分不能用于 API'
  }
  if (number === 2000 || httpStatus === 429) return 'Tripo 请求过于频繁，请稍后重试'
  if (number === 2008 || /content policy|sensitive|moderation/.test(text)) return 'Tripo 内容审核未通过，请调整参考图或提示词'
  if (number === 2015) return 'Tripo 模型版本已停用，请检查 TRIPO_MODEL 配置'
  if ([1004, 2002].includes(number)) return 'Tripo 参数不受支持，请检查模型版本、贴图版本及参数组合'
  if (number === 2018) return 'Tripo 认为输入过于复杂，请简化参考图或降低面数'
  if ([2003, 2004].includes(number) || /download|image url|invalid image/.test(text)) {
    return 'Tripo 无法读取参考图，请确认图片是可公网访问的 PNG / JPEG / WebP，且不超过 20MB'
  }
  if (httpStatus === 404) return 'Tripo 任务不存在或已过期，请重新确认任务 ID'
  if (httpStatus === 403) return 'Tripo 账户无权访问该资源，请检查 API 权限和可用积分'
  return String(message || 'Tripo 请求失败').slice(0, 500)
}

async function requestTripo(path, init, environment, fetchImplementation) {
  const apiKey = value(environment, 'TRIPO_API_KEY')
  if (!apiKey) throw fail('请先在项目根目录 .env.local 中填写：TRIPO_API_KEY', 503)
  let response
  try {
    response = await fetchImplementation(`${baseUrl}${path}`, {
      method: init.method || 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    // Never automatically resubmit a paid generation after a connection timeout.
    const timedOut = ['TimeoutError', 'AbortError'].includes(error?.name)
    throw fail(timedOut
      ? 'Tripo 请求超时；任务可能已经提交，请先到开发者平台确认，避免重复生成扣费'
      : '无法连接 Tripo 官方接口，请检查网络后重试', timedOut ? 504 : 502)
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    if (!response.ok) throw fail(explainTripoError(null, `Tripo 请求失败（HTTP ${response.status}）`, response.status), response.status)
    throw fail(`Tripo 返回了无法解析的响应（HTTP ${response.status}）`, 502)
  }
  if (!response.ok || Number(payload?.code ?? 0) !== 0) {
    const message = explainTripoError(payload?.code, payload?.message, response.status).split(apiKey).join('[已隐藏]')
    const statusCode = response.ok ? ([1000, 1001].includes(Number(payload?.code)) ? 401
      : Number(payload?.code) === 2010 ? 402 : 400) : response.status
    throw fail(message, statusCode)
  }
  return payload
}

export async function startTripoTask(input, environment = process.env, fetchImplementation = fetch) {
  const request = buildTripoRequest(input, environment)
  const payload = await requestTripo(request.path, { method: 'POST', body: request.body }, environment, fetchImplementation)
  const taskId = payload?.data?.task_id
  if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(taskId)) {
    throw fail('Tripo 接口没有返回有效任务 ID，请到开发者平台确认是否已提交，避免重复扣费', 502)
  }
  return { taskId: `${taskPrefix}${taskId}`, status: 'PENDING', provider: 'tripo', inputMode: request.mode }
}

export async function getTripoTaskStatus(taskId, environment = process.env, fetchImplementation = fetch) {
  const nativeId = taskId.startsWith(taskPrefix) ? taskId.slice(taskPrefix.length) : taskId
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(nativeId)) throw fail('Tripo 任务 ID 格式不正确')
  const payload = await requestTripo(`/tasks/${encodeURIComponent(nativeId)}`, {}, environment, fetchImplementation)
  const task = payload?.data
  if (!task || typeof task.status !== 'string') throw fail('Tripo 查询没有返回有效任务状态', 502)
  const states = { queued: 'PENDING', running: 'RUNNING', success: 'SUCCEEDED', failed: 'FAILED', cancelled: 'CANCELED', canceled: 'CANCELED' }
  let status = states[task.status.toLowerCase()] || 'UNKNOWN'
  const output = task.output || {}
  const modelUrl = typeof output.model_url === 'string' ? output.model_url : ''
  let error = status === 'FAILED' ? explainTripoError(task.error_code, task.error_message) : ''
  if (status === 'SUCCEEDED' && !modelUrl) {
    status = 'FAILED'
    error = 'Tripo 任务完成，但没有返回模型文件，请到开发者平台查看任务详情'
  }
  const apiKey = value(environment, 'TRIPO_API_KEY')
  return {
    taskId, status, modelUrl,
    previewUrl: typeof output.rendered_image_url === 'string' ? output.rendered_image_url : '',
    error: apiKey ? error.split(apiKey).join('[已隐藏]') : error,
    ...(Number.isFinite(task.progress) ? { progress: task.progress } : {}),
  }
}

export function isAllowedGeneratedAssetUrl(source) {
  try {
    const url = new URL(source)
    const domains = ['tripo3d.ai', 'tripo3d.com', 'aliyuncs.com', 'alicdn.com']
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  } catch {
    return false
  }
}
