import type { ResearchSource } from './types'

export function retrievedSources(candidates: ResearchSource[]) {
  const unique = new Map<string, ResearchSource>()
  for (const source of candidates) {
    const previous = unique.get(source.url)
    if (!previous) unique.set(source.url, { ...source })
    else {
      if (source.excerpt && !previous.excerpt?.includes(source.excerpt)) previous.excerpt = [previous.excerpt, source.excerpt].filter(Boolean).join('\n\n')
      const origins = [...new Set([...(previous.origins || [previous.origin || 'web']), ...(source.origins || [source.origin || 'web'])])]
      if (origins.length > 1) previous.origins = origins
    }
  }
  return [...unique.values()]
}

// Native web markers and local evidence numbers occupy different namespaces.
// Never infer a citation merely because a result was retrieved.
export function citedSources(content: string, candidates: ResearchSource[]) {
  const used = new Set<ResearchSource>()
  for (const match of content.matchAll(/\[ref_(\d+)\]|\[local_(\d+)\]|\[(\d+)\](?!\()/gi)) {
    const source = match[1] !== undefined
      ? candidates.find(s => s.origin !== 'local' && s.citationIndex === Number(match[1]))
      : match[2] !== undefined
        ? candidates.filter(s => s.origin === 'local')[Number(match[2]) - 1]
        : candidates.every(s => s.origin === 'local') ? candidates[Number(match[3]) - 1] : undefined
    if (source) used.add(source)
  }
  for (const match of content.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/g)) {
    const source = candidates.find(s => s.url === match[1])
    if (source) used.add(source)
  }
  return candidates.filter((source, index) => used.has(source) && candidates.findIndex(item => used.has(item) && item.url === source.url) === index)
}

export function resolveCitationMarkers(content: string, candidates: ResearchSource[]) {
  const sources = retrievedSources(candidates)
  const link = (source?: ResearchSource) => source ? `[${sources.findIndex(item => item.url === source.url) + 1}](${source.url})` : ''
  return content.replace(/\[ref_(\d+)\]|\[local_(\d+)\]|\[(\d+)\](?!\()/gi, (_, web, local, legacy) => {
    if (web !== undefined) return link(candidates.find(s => s.origin !== 'local' && s.citationIndex === Number(web)))
    const localSources = candidates.filter(s => s.origin === 'local')
    return link(local !== undefined ? localSources[Number(local) - 1] : candidates.every(s => s.origin === 'local') ? candidates[Number(legacy) - 1] : undefined)
  }).replace(/\[(?:ref|local)(?:_\d*)?$/i, '')
    .replace(/\[[^\]\n]+\]\(([^)]+)\)/g, (marker, url) => {
      const source = sources.find(s => s.url === url)
      return source ? link(source) : /^\[(?:\d+|来源|参考来源)\]/.test(marker) ? '（出处待核对）' : marker
    })
}
