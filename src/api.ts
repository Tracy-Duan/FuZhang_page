import { authenticatedFetch } from './components/auth/session'
import type { ChatMessage, ProcessTraceStep, ResearchResult, ResearchSource } from './types'
import type { CompanionMessage, CompanionReply } from './components/companionMessages'

interface StreamCallbacks {
  onDelta: (text: string) => void
  onStatus?: (event: {
    phase: ProcessTraceStep['phase']
    label: string
    detail?: string
    route?: ChatMessage['route']
  }) => void
  onSource?: (source: ResearchSource) => void
}

export async function streamCompanion(messages: CompanionMessage[], context: { view: string; topic: string }, onDelta: (value: string) => void, signal: AbortSignal): Promise<CompanionReply> {
  const response = await authenticatedFetch('/api/companion/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ messages: messages.slice(-12).map(({ role, content }) => ({ role, content })), context: { view: context.view, topic: context.topic.slice(0, 80) } }) })
  if (!response.ok || !response.body) throw new Error('companion_unavailable')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', result: CompanionReply | undefined
  function consume(block: string) {
    const event = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim()
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data) return
    const payload = JSON.parse(data)
    if (event === 'delta' && typeof payload.text === 'string') onDelta(payload.text)
    if (event === 'done' && typeof payload.answer === 'string') result = payload
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n')
      let index = buffer.indexOf('\n\n')
      while (index >= 0) { consume(buffer.slice(0, index)); buffer = buffer.slice(index + 2); index = buffer.indexOf('\n\n') }
      if (done) break
    }
    if (buffer.trim()) consume(buffer)
    if (!result) throw new Error('companion_incomplete')
    return result
  } finally { reader.releaseLock() }
}

export async function streamHanfu(messages: ChatMessage[], callbacks: StreamCallbacks, options: { forceSearch?: boolean } = {}) {
  const response = await authenticatedFetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(({ role, content, images, attachments }) => ({ role, content, images, attachments })),
      forceSearch: options.forceSearch === true,
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `请求失败（${response.status}）`)
  }
  if (!response.body) throw new Error('浏览器没有收到流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: ResearchResult | undefined

  function consumeBlock(block: string) {
    let eventName = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (!dataLines.length) return
    const payload = JSON.parse(dataLines.join('\n'))
    if (eventName === 'delta' && typeof payload.text === 'string') callbacks.onDelta(payload.text)
    if (eventName === 'status' && typeof payload.label === 'string') {
      callbacks.onStatus?.({
        phase: payload.phase || 'understand',
        label: payload.label,
        detail: typeof payload.detail === 'string' ? payload.detail : undefined,
        route: payload.route,
      })
    }
    if (eventName === 'source' && typeof payload.url === 'string' && typeof payload.title === 'string') {
      callbacks.onSource?.(payload as ResearchSource)
    }
    if (eventName === 'done') result = payload as ResearchResult
    if (eventName === 'error') throw new Error(payload.error || '流式请求失败')
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      consumeBlock(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
    }
    if (done) break
  }
  if (buffer.trim()) consumeBlock(buffer)
  if (!result) throw new Error('模型流结束时没有返回完整结果')
  return result
}
