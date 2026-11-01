import type { ChatMessage, HistoryItem } from './types'
import { normalizeDesignPlan } from './design'

const storageKey = 'yijing.history.v1'
const historyLimit = 50

function recoverAssistantAnswer(content: string) {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !/"answer"\s*:/.test(trimmed)) return content
  try {
    const parsed = JSON.parse(trimmed) as { answer?: unknown }
    if (typeof parsed.answer === 'string' && parsed.answer.trim()) return parsed.answer
  } catch {
    const match = /"answer"\s*:\s*"/.exec(trimmed)
    if (!match) return content
    let recovered = ''
    for (let index = match.index + match[0].length; index < trimmed.length; index += 1) {
      const character = trimmed[index]
      if (character === '"') break
      if (character !== '\\') {
        recovered += character
        continue
      }
      if (index + 1 >= trimmed.length) break
      const escaped = trimmed[index + 1]
      const simpleEscapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
      if (escaped === 'u') {
        const code = trimmed.slice(index + 2, index + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(code)) break
        recovered += String.fromCharCode(Number.parseInt(code, 16))
        index += 5
      } else {
        recovered += simpleEscapes[escaped] ?? escaped
        index += 1
      }
    }
    if (recovered.trim()) return recovered
  }
  return content
}

export function loadHistory(): HistoryItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is HistoryItem => (
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as HistoryItem).id === 'string' &&
        typeof (item as HistoryItem).title === 'string' &&
        typeof (item as HistoryItem).question === 'string' &&
        typeof (item as HistoryItem).createdAt === 'number' &&
        typeof (item as HistoryItem).updatedAt === 'number' &&
        typeof (item as HistoryItem).view === 'string'
      ))
      .map((item) => {
        const research = item.research && typeof item.research.answer === 'string' ? {
          title: item.research.title || item.title,
          answer: recoverAssistantAnswer(item.research.answer).replace(/衣镜/g, '服章'),
          sources: Array.isArray(item.research.sources) ? item.research.sources : [],
          suggestions: item.research.suggestions,
          citationWarning: item.research.citationWarning,
        } : undefined
        const savedMessages = Array.isArray(item.messages)
          ? item.messages.filter((message): message is ChatMessage => (
              Boolean(message) &&
              typeof message === 'object' &&
              (message.role === 'user' || message.role === 'assistant') &&
              typeof message.content === 'string'
            )).map((message) => message.role === 'assistant'
              ? { ...message, content: recoverAssistantAnswer(message.content).replace(/衣镜/g, '服章') }
              : message)
          : []
        const migratedMessages: ChatMessage[] = savedMessages.length ? savedMessages : [
          {
            id: `${item.id}-user`,
            role: 'user',
            content: item.question,
            createdAt: item.createdAt,
          },
          ...(research ? [{
            id: `${item.id}-assistant`,
            role: 'assistant' as const,
            content: research.answer,
            title: research.title,
            sources: research.sources,
            createdAt: item.updatedAt,
          }] : []),
        ]
        return {
          ...item,
          view: 'research' as const,
          research,
          title: item.title.replace(/衣镜/g, '服章'),
          messages: migratedMessages,
          design: item.design ? normalizeDesignPlan(item.design) : undefined,
        }
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, historyLimit)
  } catch {
    return []
  }
}

export function saveHistory(items: HistoryItem[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items.slice(0, historyLimit)))
  } catch {
    // 浏览器禁用本地存储时，当前会话仍可正常使用。
  }
}
