import { ArrowRight, ExternalLink } from 'lucide-react'
import { resolvedSuggestions } from '../suggestions'
import type { ResearchSource } from '../types'

interface InspectorProps {
  sources: ResearchSource[]
  suggestions?: string[]
  streaming?: boolean
  onSuggestion: (suggestion: string) => void
}

export function Inspector({ sources, suggestions, streaming = false, onSuggestion }: InspectorProps) {
  if (!streaming && !sources.length) {
    return (
      <aside className="context-inspector contextual-panel panel-enter exploration-inspector">
        <div className="inspector-head">
          <h2>继续探索</h2>
          <p>从刚才的回答出发，继续了解汉服</p>
        </div>
        <div className="inspector-suggestions">
          {resolvedSuggestions(suggestions).map((suggestion, index) => (
            <button type="button" onClick={() => onSuggestion(suggestion)} key={suggestion}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{suggestion}</strong>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
        <blockquote>你也可以直接在下方输入新的问题。</blockquote>
      </aside>
    )
  }

  return (
    <aside className="context-inspector contextual-panel panel-enter">
      <div className="inspector-head">
        <h2>参考来源</h2>
        <p>专有知识库与网页来源</p>
      </div>

      <div className="source-list">
        {sources.length ? sources.map((source, index) => (
          <a href={source.url} target="_blank" rel="noreferrer" className="source-item" key={source.id || `${source.url}-${index}`}>
            <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="source-content">
              <strong>{source.title}</strong>
              <small className="source-url" title={source.url}>链接：{source.url}</small>
              <em className={`source-tier ${source.trustLevel || 'general'}`}>{source.trustLabel || '线索来源'}</em>
            </span>
            <ExternalLink size={14} strokeWidth={1.5} />
          </a>
        )) : <p className="source-empty">等待模型返回可追溯来源。</p>}
      </div>

      <blockquote>专有知识库与联网需求分别判断；需要时会综合两类证据回答。</blockquote>
    </aside>
  )
}
