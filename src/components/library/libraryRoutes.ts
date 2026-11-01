import type { LibraryRoute } from '../../library'

export function articleRoute(route: LibraryRoute, articleId: string, listPage: number): LibraryRoute {
  return { category: route.category, articleId, query: route.query, dynasty: route.dynasty, status: route.status, listPage }
}
export function returnToResults(route: LibraryRoute): LibraryRoute {
  return { category: route.category, query: route.query, dynasty: route.dynasty, status: route.status, page: route.listPage || 1 }
}
export function paginationItems(page: number, total: number): (number | 'gap')[] {
  const last = Math.max(1, Math.floor(total) || 1)
  const current = Math.max(1, Math.min(last, Math.floor(page) || 1))
  const pages = new Set([1, last, current - 1, current, current + 1])
  if (current <= 3) for (let n = 2; n <= Math.min(last, 4); n++) pages.add(n)
  if (current >= last - 2) for (let n = Math.max(1, last - 3); n < last; n++) pages.add(n)
  const sorted = [...pages].filter(n => n >= 1 && n <= last).sort((a, b) => a - b)
  const result: (number | 'gap')[] = []
  for (const value of sorted) {
    const previous = result.at(-1)
    if (typeof previous === 'number' && value - previous === 2) result.push(previous + 1)
    else if (typeof previous === 'number' && value - previous > 2) result.push('gap')
    result.push(value)
  }
  return result
}
export function passageLabel(heading: string) { return heading.includes('｜') ? heading.slice(heading.indexOf('｜') + 1).trim() : heading }
