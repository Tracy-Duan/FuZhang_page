export const DEFAULT_INTENT_MODEL = 'tongyi-intent-detect-v3'

const categories = {
  A: '直接回应：寒暄、身份介绍、已有内容改写、无史据要求的穿搭、配色、纯审美或创意讨论，在当前对话直接回答。',
  B: '汉服知识检索：形制、朝代、文物、古籍、纹样、工艺、历史比较，或穿搭讨论中需要历史依据的问题，先查本地资料。是否联网由用户开关决定。',
  C: '外部或最新信息：活动、展览、最新消息、明确网址或需要外部核验的问题；是否查询网页由用户开关决定。',
}

export const intentInstructions = `You are Qwen, created by Alibaba Cloud. You are a helpful assistant.
You should choose one tag from the tag list:
${JSON.stringify(categories)}
Just reply with the chosen tag.`

// This guard enforces explicit user constraints; it does not classify knowledge topics.
// Consume whole clauses so the “联网” inside “不要联网” cannot re-enable web access.
export function explicitWebPolicy(messages) {
  let policy
  const prefix = /^(?:(?:请|现在|这次|本次|本轮|接下来|以后|先|后续|都|我要求|要求)\s*)+/
  const deny = /^(?:不要联网|不联网|别联网|禁止联网|不用联网|无需联网|不需要联网|不要上网|不要搜索网页|(?:只|仅)(?:用|使用|依据|根据|查|查询|从|在)?(?:本地(?:资料|知识库|证据|来源)?|知识库))/
  const allow = /^(?:可以|允许|需要|改为|恢复|重新|开启|帮我|要)?(?:联网(?:搜索|查询|检索)?|上网查(?:询)?|搜索网页)/
  const requestTail = /^(?:$|\s|回答|帮|分析|搜索|检索|查|里|中|来|就|即可|就行)/
  for (const message of messages) {
    if (message.role !== 'user') continue
    const clauses = String(message.content || '').split(/[，,、。；;：:\n！？!?]|但是|不过|但/)
    for (const clause of clauses) {
      const statement = clause.trim().replace(prefix, '')
      const denied = deny.exec(statement)
      const allowed = allow.exec(statement)
      if (denied && requestTail.test(statement.slice(denied[0].length))) policy = 'local_only'
      else if (allowed && requestTail.test(statement.slice(allowed[0].length))) policy = 'auto'
    }
  }
  return policy
}

export function compactIntentConversation(messages) {
  let budget = 3500
  const selected = []
  for (const message of messages.slice(-10).reverse()) {
    if (!['user', 'assistant'].includes(message.role) || budget <= 0) continue
    const text = String(message.content || '')
    const limit = Math.min(budget, selected.length ? 700 : 1800)
    const content = text.length <= limit ? text : limit <= 201 ? text.slice(0, limit) : `${text.slice(0, limit - 201)}\n…\n${text.slice(-198)}`
    if (content) { selected.push({ role: message.role, content });budget -= content.length }
  }
  return selected.reverse()
}

export function planFromIntent(tag, messages) {
  if (!Object.hasOwn(categories, tag)) throw new Error('Invalid intent tag')
  const latest = [...messages].reverse().find(message => message.role === 'user')?.content || ''
  const webPolicy = explicitWebPolicy(messages) || 'auto'
  return {
    useRag: tag === 'B' || (tag === 'C' && webPolicy === 'local_only'),
    useWeb: tag === 'C' && webPolicy !== 'local_only',
    webPolicy,
    reason: categories[tag],
    title: String(latest).replace(/\s+/g, ' ').trim().slice(0, 48) || '汉服资料辨析',
    suggestions: [],
  }
}

export async function detectChatIntent(messages, { requireConfig }) {
  const { apiKey, baseUrl } = requireConfig()
  const model = process.env.INTENT_MODEL?.trim() || DEFAULT_INTENT_MODEL
  const fallbackModel = process.env.LLM_MODEL?.trim() || 'qwen3.7-flash'
  const conversation = compactIntentConversation(messages)
  for (const [index, candidate] of [...new Set([model, fallbackModel])].entries()) {
    try {
      const payload = await fetch(`${baseUrl}/compatible-mode/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(index ? 6000 : 4000),
        body: JSON.stringify({
          model: candidate,
          messages: [{ role: 'system', content: intentInstructions }, ...conversation],
          max_tokens: 8,
          ...(candidate.startsWith('qwen') ? { enable_thinking: false } : {}),
        }),
      }).then(async response => {
        if (!response.ok) throw new Error('Intent service unavailable')
        return response.json()
      })
      const tag = payload.choices?.[0]?.message?.content?.trim()
      return { ...planFromIntent(tag, messages), intentModel: candidate, intentFallback: index > 0 }
    } catch {
      // Transport failures and invalid labels both fall back without exposing provider details.
    }
  }
  return {
    ...planFromIntent('B', messages), intentModel: 'safe-fallback', intentFallback: true,
    reason: '意图判断暂时不可用，保留用户联网限制并检查本地资料。',
  }
}
