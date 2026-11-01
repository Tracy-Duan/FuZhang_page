import { memo } from 'react'
import { ArrowRight, Check, ChevronDown, ExternalLink, LoaderCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolvedSuggestions } from '../suggestions'
import { knowledgeCopy } from '../knowledgeCopy'
import { citedSources, retrievedSources, resolveCitationMarkers } from '../citations'
import type { ChatMessage, ResearchResult, ResearchSource } from '../types'

function visibleAnswerContent(content: string) {
  return content
    .replace(/\s*[（(]\s*(?:research|customize)\s*[）)]/gi, '')
    .replace(/\b(?:research|customize)\s*[\/／、]\s*(?:research|customize)\b/gi, '知识问答')
}

function circledCitationNumber(index: number) {
  return index >= 1 && index <= 20 ? String.fromCodePoint(0x2460 + index - 1) : String(index)
}

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] }
// Accept only line breaks, never arbitrary model-generated HTML.
function remarkLineBreaks() {
  return function walk(node: MarkdownNode) {
    if (node.type === 'html' && /^<br\s*\/?>$/i.test(node.value || '')) {
      node.type = 'break'
      delete node.value
    }
    node.children?.forEach(walk)
  }
}

const MarkdownAnswer = memo(function MarkdownAnswer({ content, sources = [] }: { content: string; sources?: ResearchSource[] }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkLineBreaks]}
      components={{
        table: ({ children }) => <div className="answer-table-scroll" role="region" aria-label="对比表格" tabIndex={0}><table>{children}</table></div>,
        a: ({ children, href }) => {
          const label = String(children)
          const isCitation = /^\d+$/.test(label) && sources.some((source) => source.url === href)
          return isCitation ? (
            <a className="inline-citation" href={href} target="_blank" rel="noreferrer" aria-label={`查看参考来源 ${label}`}>
              <span aria-hidden="true">{circledCitationNumber(Number(label))}</span>
            </a>
          ) : (
            <a href={href} target="_blank" rel="noreferrer">{children}</a>
          )
        },
      }}
    >
      {resolveCitationMarkers(visibleAnswerContent(content), sources)}
    </ReactMarkdown>
  )
})

function streamingTailText(content: string) {
  return content
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|~~|`/g, '')
}

const StreamingMarkdownAnswer = memo(function StreamingMarkdownAnswer({ content, sources = [] }: { content: string; sources?: ResearchSource[] }) {
  const visibleContent = visibleAnswerContent(content)
  const boundary = visibleContent.lastIndexOf('\n\n')
  const stableContent = boundary >= 0 ? visibleContent.slice(0, boundary + 2) : ''
  const activeTail = boundary >= 0 ? visibleContent.slice(boundary + 2) : visibleContent

  return (
    <>
      {stableContent ? <MarkdownAnswer content={stableContent} sources={sources} /> : null}
      {activeTail ? /\n\s*\|?\s*:?-{3}/.test(activeTail) ? <MarkdownAnswer content={activeTail} sources={sources} /> : <span className="streaming-markdown-tail">{streamingTailText(activeTail)}</span> : null}
    </>
  )
})

function formatDuration(durationMs?: number) {
  if (!durationMs) return ''
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  return ` · ${seconds} 秒`
}

const ProcessTrace = memo(function ProcessTrace({ message, active }: { message: ChatMessage; active: boolean }) {
  const trace = message.trace || []
  if (!trace.length) return null

  const activeStep = [...trace].reverse().find((step) => step.status === 'active')
  const processName = message.route === 'direct' ? '回答诊断' : '检索与生成诊断'
  const routeLabel = message.route === 'search' ? '联网检索' : message.route === 'rag' ? '专有知识库' : message.route === 'direct' ? '直接回答' : ''

  return (
    <details className={`process-trace ${active ? 'active' : ''}`} open={active ? true : undefined}>
      <summary>
        <span className="trace-summary-icon" aria-hidden="true">
          {active ? <LoaderCircle size={15} /> : <Check size={14} />}
        </span>
        <span className="trace-summary-copy">
          <strong>{knowledgeCopy(activeStep?.label || `${processName}已完成`)}</strong>
          <small>{routeLabel}{formatDuration(message.durationMs)}</small>
        </span>
        <ChevronDown className="trace-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="trace-steps">
        {trace.map((step) => (
          <div className={`trace-step ${step.status}`} key={step.id}>
            <span className="trace-dot" aria-hidden="true" />
            <div>
              <strong>{knowledgeCopy(step.label)}</strong>
              {step.detail ? <p>{knowledgeCopy(step.detail)}</p> : null}
            </div>
          </div>
        ))}
      </div>
      <p className="trace-disclosure">这里展示可验证的处理阶段与耗时；不展示模型私有思维链。</p>
    </details>
  )
})

function SourceDisclosure({ content, candidates }: { content: string; candidates: ResearchSource[] }) {
  const sources = retrievedSources(candidates)
  const cited = new Set(citedSources(content, candidates).map(source => source.url))
  if (!sources.length) return null
  return <details className="source-disclosure">
    <summary><strong>本次检索来源</strong><small>{sources.length} 项检索记录</small><ChevronDown size={16} /></summary>
    <p className="retrieval-note">包含本轮专有知识库与联网检索结果；是否在正文标注引用单独显示。</p>
    <div className="dynamic-source-grid">{sources.map((source, index) => <a className="quote-panel dynamic-source" href={source.url} target="_blank" rel="noreferrer" key={source.url}>
      <span>{String(index + 1).padStart(2, '0')}</span><div><p>{source.title}</p>
        <small className="retrieval-source-meta">{(source.origins || [source.origin || 'web']).map(origin => origin === 'local' ? '专有知识库 · RAG' : '联网检索').join(' / ')} · {cited.has(source.url) ? '正文已标注' : '正文未标注'}</small>
        {source.excerpt ? <p className="retrieval-source-excerpt">{source.excerpt}</p> : null}
        <small className="dynamic-source-url">链接：{source.url}</small><small className={`source-tier ${source.trustLevel || 'general'}`}>{source.trustLabel || '线索来源'}</small>
        {source.reason ? <small className="retrieval-source-reason">{source.reason}</small> : null}
      </div><ExternalLink size={13} />
    </a>)}</div>
  </details>
}

interface ResearchViewProps {
  messages: ChatMessage[]
  result?: ResearchResult
  error?: string
  streaming?: boolean
  onSuggestion: (suggestion: string) => void
}

export function ResearchView({ messages, result, error, streaming = false, onSuggestion }: ResearchViewProps) {
  const hasSources = Boolean(result?.sources.length)
  const hasLocalSources = Boolean(result?.sources.some((source) => source.origins?.includes('local') || source.origin === 'local'))
  const hasWebSources = Boolean(result?.sources.some((source) => source.origins?.includes('web') || source.origin !== 'local'))
  const suggestions = result ? resolvedSuggestions(result.suggestions) : []

  return (
    <article className="research-view page-enter">
      <div className="conversation-thread">
        {messages.map((message, index) => message.role === 'user' ? (
          <div className="question-row conversation-message" key={message.id}>
            <span className="user-avatar" aria-hidden="true">人</span>
            <div className="question-content">
              {message.images?.length ? (
                <div className="question-images">
                  {message.images.map((image) => <img src={image.dataUrl} alt={image.name || '用户上传的参考图片'} key={image.dataUrl.slice(-48)} />)}
                </div>
              ) : null}
              {message.attachments?.length ? <div className="question-files">{message.attachments.map(file => <span key={file.id}>{file.name}</span>)}</div> : null}
              <p>{message.content}</p>
            </div>
          </div>
        ) : (
          <section className="assistant-turn conversation-message" key={message.id}>
            <div className="answer-head">
              <span className="assistant-mark">服</span>
              <div>
                <p className="assistant-name">服章</p>
                <h1>{message.title || (streaming && index === messages.length - 1 ? '正在检索与辨析' : '汉服资料辨析')}</h1>
              </div>
            </div>
            <ProcessTrace message={message} active={streaming && index === messages.length - 1} />
            <div className="answer-summary generated-answer markdown-body">
              {streaming && index === messages.length - 1 && !message.content ? (
                <span className="answer-loading" role="status" aria-label="正在生成正文">
                  <span className="answer-loading-dot" aria-hidden="true" />
                  <span className="answer-loading-dot" aria-hidden="true" />
                  <span className="answer-loading-dot" aria-hidden="true" />
                </span>
              ) : streaming && index === messages.length - 1 ? (
                <StreamingMarkdownAnswer content={message.content} sources={message.sources} />
              ) : (
                <MarkdownAnswer content={message.content} sources={message.sources} />
              )}
            </div>
            {message.citationWarning ? <p className="citation-notice" role="status">{message.citationWarning}</p> : null}
            <SourceDisclosure content={message.content} candidates={message.sources || []} />
          </section>
        ))}
      </div>

      {error ? (
        <div className="api-error answer-summary">
          <strong>{error}</strong>
          <span>本轮未完成，可重新发送问题；已收到的正文和检索来源会保留。</span>
        </div>
      ) : null}

      {!streaming && result ? (
        <>
          {suggestions.length ? (
            <section className="followup-suggestions" aria-label="继续探索">
              <p>继续探索</p>
              <div>
                {suggestions.map((suggestion) => (
                  <button type="button" onClick={() => onSuggestion(suggestion)} key={suggestion}>
                    <span>{suggestion}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {hasSources ? (
            <div className="answer-footer solo">
              <p>{hasLocalSources && hasWebSources
                ? '本轮已检索专有知识库与网页 · 请复核原始出处'
                : hasLocalSources
                  ? '本轮已检索专有知识库 · 请复核原始出处'
                  : '本轮已检索网页 · 请复核原始来源'}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  )
}
