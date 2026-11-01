import { authenticatedFetch } from './components/auth/session'
import type { ChatAttachment } from './types'

export const attachmentLimit = 4
export const attachmentTextLimit = 16000
export async function prepareDocument(file: File): Promise<ChatAttachment> {
  if (file.size > 5 * 1024 * 1024) throw new Error('单个文件不能超过 5MB')
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  let text = ''
  if (['txt', 'md', 'csv'].includes(extension || '')) {
    text = await file.text()
    if (text.includes('\uFFFD')) throw new Error('文本编码无法识别，请保存为 UTF-8 后重试')
  } else if (extension === 'pdf' || extension === 'docx') {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
    const response = await authenticatedFetch('/api/attachments/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, base64 }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '文件解析失败')
    text = result.text
  } else throw new Error('支持 JPG、PNG、WEBP、TXT、MD、CSV、文本型 PDF 和 DOCX；暂不支持扫描件与旧版 DOC')
  if (!text.trim()) throw new Error('文件没有可读取的正文')
  if (text.length > attachmentTextLimit) throw new Error('单个文件文字最多 16000 字符，请拆分文件后上传')
  return { id: crypto.randomUUID(), name: file.name, text: text.trim(), size: file.size }
}
