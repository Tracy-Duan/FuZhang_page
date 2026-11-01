import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eraHistory, eraReferral, eraReply, mentionsLaterEra } from './companion-era.mjs'

export const COMPANION_MODEL = (process.env.COMPANION_MODEL || 'qwen-flash-character').trim()
const COMPANION_BASE_URL = (process.env.COMPANION_BASE_URL || '').trim()

// The author's Markdown is the single source of truth, read when the server starts.
export const COMPANION_PERSONA = await readFile(new URL('../system_prompt_Aruo.md', import.meta.url), 'utf8')
export const COMPANION_REPLY_LIMIT = 100
export const COMPANION_MAX_TOKENS = 256
export const COMPANION_CRISIS_REPLY = '先停一下。如果你或别人正面临立即的危险，请联系当地紧急服务，并请一个信任的人到身边。不要独自面对这件事。'
const views = new Set(['home', 'research', 'clarify', 'design', 'preview', 'document'])
const usage = new Map()
let almanacFiles

export async function getCompanionAlmanac(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) !== day) throw new Error('invalid_date')
  const directory = path.dirname(fileURLToPath(import.meta.url))
  const optionalJson = (file, fallback) => readFile(file, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return fallback
    throw error
  })
  almanacFiles ||= Promise.all([
    optionalJson(path.join(process.env.HANFU_RAG_DATA_DIR?.trim() || path.join(directory, 'rag-data'), 'term_index.json'), {}),
    optionalJson(process.env.HANFU_COMPANION_QUOTES_FILE?.trim() || path.join(directory, 'companion-quotes.json'), []),
    readFile(new URL('./companion-calendar.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  const [index, quotes, calendar] = await almanacFiles
  const terms = Object.keys(index).filter(term => term.length >= 2 && term.length <= 6 && !/史$|记$|图书|语类|通典|会要|考误/.test(term)).sort()
  const ordinal = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000)
  const term = terms[ordinal % terms.length] || '深衣'
  const lunar = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' }).formatToParts(new Date(day + 'T04:00:00Z'))
  const month = lunar.find(p => p.type === 'month')?.value || '', date = lunar.find(p => p.type === 'day')?.value || ''
  const festivals = { '1-1': ['春节', 'lantern', 'cinnabar', '新岁翻新页，慢慢读。'], '1-15': ['元宵', 'lantern', 'cinnabar', '灯火照书页，元宵安好。'], '5-5': ['端午', 'zongzi', 'ochre', '端午，书页间也留一缕粽香。'], '8-15': ['中秋', 'mooncake', 'ochre', '月圆了，读书也记得歇一歇。'], '9-9': ['重阳', 'sprig', 'plum', '今日重阳，翻页也望远。'] }
  const festival = festivals[`${month}-${date}`]
  const solar = calendar.solar_terms[day]
  const season = festival ? { name: festival[0], prop: festival[1], ribbon: festival[2], copy: festival[3] } : solar ? { name: solar, copy: `今日${solar}，${/寒|霜|雪|冬/.test(solar) ? '宜添衣' : /暑|夏/.test(solar) ? '宜歇凉' : '宜翻一页书'}。` } : undefined
  return { day, term, question: `${term}有哪些值得了解的服饰知识？`, quotes, season }
}
const compact = (value, max) => Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, max).join('')
export function sanitizeCompanionInput(body) {
  const messages = (Array.isArray(body?.messages) ? body.messages : []).filter(m =>
    m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()
  ).slice(-12).map(m => ({ role: m.role, content: compact(m.content, 600) }))
  if (!messages.length || messages.at(-1).role !== 'user') throw new Error('invalid_messages')
  return { messages, context: { view: views.has(body?.context?.view) ? body.context.view : 'home', topic: compact(body?.context?.topic, 80) } }
}
export function knowledgeReferral(text) {
  const specific = /形制|结构|朝代|文物|出处|年代|考古|起源|裁剪|服制|制度|史料|出土|馆藏|交领|右衽|左衽|领型|袖型|织造|染色|褙子|背子|深衣|道袍|马面裙|圆领袍|襦裙|齐胸|曳撒|贴里|直裾|曲裾|云肩|缂丝|朝代|哪一朝|哪个朝|哪个时代|\b(?:dynasty|archaeolog\w*|artifact|provenance|dating|robe|skirt|collar|sleeve)\b/i.test(text)
  const inquiry = /哪|什么|怎么|如何|是否|多少|介绍|讲讲|解释|区别|比较|保养|洗护|[?？]/.test(text)
  const garment = /服饰|汉服|衣裳|衣服|裙|裤|袴|袍|衫|褶|袖|衽|头冠|补子|织物|丝绸|面料|尺码/.test(text)
  return specific || (inquiry && garment) ? compact(text.replace(/^(请问|请帮我|帮我|我想知道)[，,\s]*/, ''), 500) : ''
}
export function safeCompanionReply(value) {
  const plain = compact(value, 300).replace(/（[^）]{0,60}）/g, '').replace(/\([^)]{0,60}\)/g, '').replace(/\[\d+\]|https?:\/\/\S+|[#*`>|]/g, '').replace(/(?:^|\s)\d+[.、]/g, '').trim()
  if (/离不开我|只属于|永远陪着|手机号|身份证|家庭住址|银行卡|公元\d|起源于|始于.{0,8}代|据.{0,12}记载/.test(plain)) return '这件事我不太能接住。我们换个轻松的书间话题吧。'
  return Array.from((plain.match(/[^。！？!?]+[。！？!?]?/g) || []).slice(0, 3).join('')).slice(0, COMPANION_REPLY_LIMIT).join('') || '我有些不确定，先陪你歇一歇吧。'
}
export function companionResponse(value) {
  const text = String(value || '').trim()
  if (text.includes('[[CRISIS]]')) return { answer: COMPANION_CRISIS_REPLY, crisis: true }
  if (text.includes('[[SILENT]]')) return { answer: '', silent: true }
  const action = /^[（(]?(她[^。！？!?（）()]{1,13}[。！？!?]?)[）)]?$/.exec(text)
  return { answer: action ? action[1] : safeCompanionReply(text) }
}
function dayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
function takeQuota(req, res) {
  let id = /(?:^|;\s*)fz_companion_device=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || '')?.[1]
  if (!id) { id = randomUUID(); res.setHeader('Set-Cookie', `fz_companion_device=${id}; Path=/api/companion; Max-Age=31536000; HttpOnly; SameSite=Strict`) }
  const date = dayKey(), record = usage.get(id)
  if (usage.size > 10000) for (const [key, item] of usage) if (item.date !== date) usage.delete(key)
  const count = record?.date === date ? record.count : 0
  if (count >= 40) return false
  usage.set(id, { date, count: count + 1 }); return true
}

export async function handleCompanionChat(req, res, helpers) {
  const { readJson, json, sendSse, requireConfig, consumeSse } = helpers
  let input
  try { input = sanitizeCompanionInput(await readJson(req)) } catch { return json(res, 400, { answer: '我卡住了', error: '我卡住了' }) }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')
  const allowed = takeQuota(req, res)
  res.flushHeaders()
  const finish = payload => { if (!res.destroyed) { sendSse(res, 'done', payload); res.end() } }
  if (!allowed) return finish({ answer: '今天聊太多了', limited: true })
  const question = input.messages.at(-1).content
  // Let the higher-priority support rule run even when the message also mentions clothes.
  const supportTopic = /自杀|自残|割腕|跳楼|不想活|活不下去|想死|伤害自己|想杀|杀了|伤人/.test(question)
  const eraQuestion = supportTopic ? '' : eraReferral(input.messages)
  if (eraQuestion) return finish(eraReply(eraQuestion, /你(?:刚才|之前|上次)|你不是/.test(question)))
  const referral = supportTopic ? '' : knowledgeReferral(question)
  if (referral) return finish({ answer: '问大服章吧。它答得比我准——我在这儿听着。', referral })
  if (!supportTopic && /手机号|身份证|家庭住址|银行卡/.test(question)) return finish({ answer: '我是书里的阿箬，只陪你读书和歇歇。要不要换个轻松的话题？' })
  const abort = new AbortController()
  const onClose = () => abort.abort()
  res.on('close', onClose)
  const timer = setTimeout(() => abort.abort(), 25000)
  try {
    const { apiKey, baseUrl } = requireConfig()
    const endpoint = `${(COMPANION_BASE_URL || baseUrl).replace(/\/$/, "")}/compatible-mode/v1/chat/completions`
    const upstream = await fetch(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({ model: COMPANION_MODEL, max_tokens: COMPANION_MAX_TOKENS, temperature: 0.8, enable_thinking: false, stream: true,
        messages: [{ role: 'system', content: COMPANION_PERSONA + `\n当前页面（仅供语境）：${JSON.stringify(input.context)}` }, ...eraHistory(input.messages)] }),
    })
    if (!upstream.ok || !upstream.body) throw new Error('companion_unavailable')
    let text = ''
    await consumeSse(upstream.body, event => {
      text += event.choices?.[0]?.delta?.content || ''
    }, { inactivityMs: 15000 })
    let result = companionResponse(text)
    if (!supportTopic && !result.silent && !result.crisis && mentionsLaterEra(text)) result = eraReply(question)
    // Validate the entire short reply before displaying any text, so an invalid first
    // sentence cannot flash on screen and become the next turn's apparent memory.
    if (result.answer && !result.crisis && !res.destroyed) sendSse(res, 'delta', { text: result.answer })
    finish(result)
  } catch { finish({ answer: '我卡住了' }) }
  finally { clearTimeout(timer); res.off('close', onClose) }
}
