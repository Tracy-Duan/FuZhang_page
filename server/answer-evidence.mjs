export const evidenceInstructions = `回答排版：比较或对比多个对象、且比较维度明确时，优先使用合法的 Markdown 表格（表头、分隔行、数据行，以换行分隔），表格前后空一行。普通问题不强制表格。不用代码围栏包裹表格，资料不足的单元格写“资料不足”。关键事实须在该事实所在段落或表格单元格标注支持它的来源。本地证据只能使用 [local_1] 这样的原始编号。网页证据必须使用工具实际返回的完整网址，写成 [来源](https://实际返回的完整网址)，不自行编造网址或 [ref_N] 编号；该接口的网页来源列表不保证提供引用编号，不得根据排列猜测。严禁用裸 [1]、[2] 代表网页或本地来源，也不要把本地编号重新排序。只引用确实支持相关陈述的证据；没有使用的检索候选不要引用，不为凑齐编号贴来源。每个表格事实单元格须给出相应引用。资料未覆盖的方向、制法、尺寸、年代等应写资料不足，不能把未检索到规定推断为历史上不存在规定。不得用普通百科或自媒体替代馆藏/考古证据，不得把综述论文、模型推断称为一级实物信源。`

function evidenceSource(web, local, legacy, candidates) {
  if (web !== undefined) return candidates.find(source => source.origin !== 'local' && source.citationIndex === Number(web))
  const locals = candidates.filter(source => source.origin === 'local')
  if (local !== undefined) return locals[Number(local) - 1]
  // Old all-local saved answers used bare numbers. Mixed namespaces are ambiguous.
  if (legacy !== undefined && locals.length === candidates.length) return locals[Number(legacy) - 1]
}

export function unresolvedEvidenceMarkers(answer, candidates) {
  const markers = [...answer.matchAll(/\[ref_(\d+)\]|\[local_(\d+)\]|\[(\d+)\](?!\()/gi)]
    .filter(([, web, local, legacy]) => !evidenceSource(web, local, legacy, candidates))
    .map(match => match[0])
  const links = [...answer.matchAll(/\[((?:\d+|来源|参考来源))\]\((https?:\/\/[^)]+)\)/g)]
    .filter(([, , url]) => !candidates.some(source => source.url === url))
    .map(match => match[0])
  return [...markers, ...links]
}

export function localEvidenceMarkers(context) {
  return context.replace(/\[(\d+)\]/g, '[local_$1]')
}

// Retrieval records are retained independently of whether the model cited them.
export function finalizeEvidence(answer, candidates) {
  const used = new Set()
  const references = []
  let normalized = answer.replace(/\[ref_(\d+)\]|\[local_(\d+)\]|\[(\d+)\](?!\()/gi, (_, web, local, legacy) => {
    const source = evidenceSource(web, local, legacy, candidates)
    if (!source) return ''
    used.add(source.url)
    references.push(source)
    return `\u0000CITE${references.length - 1}\u0000`
  })
  for (const match of normalized.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/g)) {
    if (candidates.some(source => source.url === match[1])) used.add(match[1])
  }
  const unique = new Map()
  for (const source of candidates) {
    const existing = unique.get(source.url)
    if (!existing) unique.set(source.url, { ...source })
    else {
      if (source.excerpt && !existing.excerpt?.includes(source.excerpt)) existing.excerpt = [existing.excerpt, source.excerpt].filter(Boolean).join('\n\n')
      const origins = [...new Set([...(existing.origins || [existing.origin || 'web']), ...(source.origins || [source.origin || 'web'])])]
      if (origins.length > 1) existing.origins = origins
    }
  }
  const sources = [...unique.values()]
  const link = source => `[${sources.findIndex(item => item.url === source.url) + 1}](${source.url})`
  normalized = normalized.replace(/\u0000CITE(\d+)\u0000/g, (_, index) => link(references[Number(index)]))
    .replace(/\[[^\]\n]+\]\(([^)]+)\)/g, (marker, url) => {
      const source = sources.find(item => item.url === url)
      return source ? link(source) : /^\[(?:\d+|来源|参考来源)\]/.test(marker) ? '（出处待核对）' : marker
    })
  const unresolved = unresolvedEvidenceMarkers(answer, candidates)
  const citationWarning = unresolved.length
    ? '部分正文引用未能匹配检索来源，请结合下方原文核查。'
    : sources.length && !used.size ? '正文未标注具体出处，可展开下方检索来源查看。' : undefined
  return { answer: normalized, sources, ...(citationWarning ? { citationWarning } : {}) }
}
