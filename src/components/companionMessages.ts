import { readLocal, spiritKeys } from './bookSpiritStore'
export interface CompanionMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; referral?: string; kind?: 'reaction' | 'crisis' }
export interface CompanionReply { answer: string; referral?: string; limited?: boolean; silent?: boolean; crisis?: boolean }
export interface CompanionAlmanac {
  day: string; term: string; question: string
  quotes: { text: string; cite: string; url: string; pid: string; license: string }[]
  season?: { name: string; copy: string; prop?: 'lantern' | 'zongzi' | 'mooncake' | 'sprig'; ribbon?: 'cinnabar' | 'ochre' | 'plum' }
}
export function loadCompanionMessages(): CompanionMessage[] {
  const value = readLocal<unknown>(spiritKeys.chat, [])
  if (!Array.isArray(value)) return []
  return value.filter((m): m is CompanionMessage => m && typeof m.id === 'string' && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.length <= 600 && typeof m.createdAt === 'number' && (!m.referral || typeof m.referral === 'string') && (!m.kind || m.kind === 'reaction')).slice(-120)
}
export function localDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
