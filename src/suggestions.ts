export const fallbackSuggestions = [
  '汉服有哪些基本形制？',
  '怎样判断汉服史料是否可靠？',
  '不同朝代的日常穿搭有哪些差异？',
]

function fromUserPerspective(suggestion: string) {
  const text = suggestion.replace(/\s+/g, ' ').trim()
  if (/^(?:您|你)想了解哪个朝代/.test(text)) return '不同朝代的汉服有哪些特点？'
  if (/^(?:您|你)(?:需要|想要|想)定制/.test(text)) return '日常汉服搭配有哪些注意事项？'
  if (/^(?:您|你).*(?:形制).*(?:问题|疑问)/.test(text) || /^有什么具体的形制问题/.test(text)) return '常见汉服形制有哪些区别？'
  if (/^(?:您|你)(?:想|希望|需要|是否|对).*[？?]$/.test(text)) return ''
  if (/定制|生成.{0,8}(?:效果图|3D)|开始设计|继续查看.{0,6}方案/.test(text)) return ''
  return text
}

export function resolvedSuggestions(suggestions?: string[]) {
  const cleaned = (suggestions || [])
    .filter((item) => typeof item === 'string' && item.trim())
    .map(fromUserPerspective)
    .filter(Boolean)
  return [...new Set([...cleaned, ...fallbackSuggestions])].slice(0, 3)
}
