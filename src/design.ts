import type { DesignPlan, ResearchSource } from './types'

function valueToText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join('；')
  if (value && typeof value === 'object') {
    return Object.values(value).map(valueToText).filter(Boolean).join('；')
  }
  return ''
}

export function normalizeDesignPlan(value: unknown): DesignPlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const sources = Array.isArray(source.sources)
    ? source.sources.filter((item): item is ResearchSource => (
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as ResearchSource).title === 'string' &&
        typeof (item as ResearchSource).url === 'string'
      ))
    : []
  const result: DesignPlan = {
    title: valueToText(source.title) || '汉服定制方案',
    summary: valueToText(source.summary),
    shape: valueToText(source.shape),
    colors: valueToText(source.colors),
    motif: valueToText(source.motif),
    fabric: valueToText(source.fabric),
    culturalNotes: valueToText(source.culturalNotes),
    historicalBoundary: valueToText(source.historicalBoundary),
    imagePrompt: valueToText(source.imagePrompt),
    negativePrompt: valueToText(source.negativePrompt) || undefined,
    sources,
  }
  return result.summary || result.shape || result.imagePrompt ? result : undefined
}
