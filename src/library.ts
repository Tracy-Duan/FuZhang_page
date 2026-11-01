export const librarySections = [
  { id: 'forms', label: '形制', subtitle: '一衣一裳，皆有来处。', description: '从古籍里的衣冠名物，到馆藏中的服饰参照，慢慢辨认形制与细节。' },
  { id: 'stories', label: '故事', subtitle: '衣冠之间，读见旧时日常。', description: '翻开古籍中的记述，读衣冠背后的风俗、礼仪与人间故事。' },
  { id: 'research', label: '研究', subtitle: '循着出处，再多读一页。', description: '从研究论文的原文摘录出发，了解服饰的材料、工艺与研究方法。' },
] as const
export type LibraryCategory = typeof librarySections[number]['id']
export type LibraryStatus = 'verified' | 'archived' | 'pending'
export const libraryStatusLabels: Record<LibraryStatus, string> = { verified: '已核对来源', archived: '存档待核对', pending: '新增待核对' }
export const libraryLayerLabels: Record<string, string> = { guji: '古籍记述', museum: '馆藏档案', bift: '馆藏档案', research: '研究资料', wiki: '民间资料' }
export interface LibraryRoute { category: LibraryCategory; articleId?: string; query?: string; dynasty?: string; page?: number; status?: LibraryStatus; listPage?: number }

export function parseLibraryRoute(hash: string): LibraryRoute | null {
  const [path, query = ''] = hash.split('?')
  const match = /^#library\/(forms|stories|research)(?:\/([a-f0-9]{20}))?$/.exec(path)
  if (!match) return null
  const params = new URLSearchParams(query)
  const status = params.get('status')
  const listPage = Number(params.get('from'))
  return { category: match[1] as LibraryCategory, articleId: match[2], query: (params.get('q') || '').slice(0, 100), dynasty: params.get('dynasty') || '', page: Math.max(1, Math.floor(Number(params.get('page')) || 1)), status: status && Object.hasOwn(libraryStatusLabels, status) ? status as LibraryStatus : undefined, listPage: match[2] && Number.isSafeInteger(listPage) && listPage > 1 ? listPage : undefined }
}

export function libraryHash(route: LibraryRoute): string {
  const params = new URLSearchParams()
  if (route.query) params.set('q', route.query)
  if (route.dynasty) params.set('dynasty', route.dynasty)
  if (route.status) params.set('status', route.status)
  if ((route.page || 1) > 1) params.set('page', String(route.page))
  if (route.articleId && (route.listPage || 1) > 1) params.set('from', String(route.listPage))
  return `#library/${route.category}${route.articleId ? `/${route.articleId}` : ''}${params.size ? `?${params}` : ''}`
}

export interface LibraryCard {
  id: string; category: LibraryCategory; title: string; kind: string; source: string; layer: string
  dynasties: string[]; tags: string[]; excerpt: string; passageCount: number; language: string
  status: LibraryStatus; reviewNote: string
}
export interface LibraryArticle extends LibraryCard {
  url: string; cite: string; grade: string; originalTitle: string; authors: string[]; date: string; doi: string
  license: string; licenseUrl: string; attribution: string; limits: string
}
export interface LibraryList {
  category: LibraryCategory; items: LibraryCard[]; total: number; page: number; pageSize: number
  counts: Record<LibraryCategory, number>; dynasties: string[]
  passageTotal: number; coverage: { totalPassages: number; statusCounts: Record<LibraryStatus, number> }
}
export interface LibraryDetail {
  article: LibraryArticle; page: number; pageSize: number; total: number
  passages: { id: string; heading: string; text: string; cite: string; url: string; license: string; licenseUrl: string; attribution: string; limits: string; status: LibraryStatus; reviewNote: string }[]
}
