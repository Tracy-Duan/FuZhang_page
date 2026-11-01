import { ArrowUp, FileText, Plus, X } from 'lucide-react'
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useBookSpirit } from './bookSpiritStore'
import { attachmentLimit, prepareDocument } from '../attachments'
import type { ChatAttachment, ChatImage } from '../types'
import { PixelCompanion } from './PixelCompanion'
import type { CompanionState } from './PixelCompanion'
import { useBookInputGaze } from './useBookInputGaze'
import { useAuth } from './auth'

interface ComposerProps {
  onSubmit: (value: string, forceWebSearch: boolean, images?: ChatImage[], attachments?: ChatAttachment[]) => void
  webSearch: boolean
  onWebSearchChange: (enabled: boolean) => void
  disabled?: boolean
  variant?: 'workspace' | 'start'
  companionState?: CompanionState
}

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

async function prepareImage(file: File): Promise<ChatImage> {
  if (!acceptedImageTypes.has(file.type)) throw new Error('请选择 JPG、PNG 或 WEBP 图片')
  if (file.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5MB')

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理这张图片')
    context.fillStyle = '#f7f5f0'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片压缩失败')), 'image/jpeg', 0.88)
    })
    return {
      name: file.name,
      mimeType: 'image/jpeg',
      dataUrl: await fileToDataUrl(blob),
      width,
      height,
    }
  } finally {
    bitmap.close()
  }
}

export function Composer({ onSubmit, webSearch, onWebSearchChange, disabled = false, variant = 'workspace', companionState = 'idle' }: ComposerProps) {
  const { isAuthenticated, openAuthModal } = useAuth()
  const spirit = useBookSpirit()
  const [value, setValue] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const busy = useRef(false)
  const [imageError, setImageError] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [inputEngaged, setInputEngaged] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const questionInputRef = useRef<HTMLInputElement>(null)
  const focusQuestion = useCallback(() => { setInputEngaged(true); questionInputRef.current?.focus() }, [])
  const inputActive = inputFocused && (inputEngaged || Boolean(value.trim())) && !disabled
  const inputGaze = useBookInputGaze(questionInputRef, inputActive)
  useEffect(() => {
    if (!spirit.draft) return
    setValue(spirit.draft.text); spirit.setDraft(undefined)
    requestAnimationFrame(focusQuestion)
  }, [spirit.draft, spirit.setDraft, focusQuestion])

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!isAuthenticated) { openAuthModal('login'); return }
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!files.length || busy.current) return
    if (files.length + images.length + attachments.length > attachmentLimit) { setImageError('图片与文件合计最多 4 个'); return }
    busy.current = true; setImageBusy(true); setImageError('')
    const nextImages = [...images], nextAttachments = [...attachments], errors: string[] = []
    for (const file of files) {
      try {
        if (acceptedImageTypes.has(file.type)) nextImages.push(await prepareImage(file))
        else {
          const document = await prepareDocument(file)
          if (nextAttachments.reduce((sum, item) => sum + item.text.length, document.text.length) > 32000) throw new Error('本次附件正文合计最多 32000 字符，请拆分提问')
          nextAttachments.push(document)
        }
      } catch (reason) { errors.push(`${file.name}：${reason instanceof Error ? reason.message : '文件处理失败'}`) }
    }
    setImages(nextImages); setAttachments(nextAttachments); setImageError(errors.join('；'))
    busy.current = false; setImageBusy(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const text = value.trim()
    if ((!text && !images.length && !attachments.length) || disabled || imageBusy) return
    onSubmit(text || '请分析附件中的服饰资料。', webSearch, images, attachments)
    setValue('')
    setImages([]); setAttachments([])
    setImageError('')
  }

  return (
    <div className={`composer-dock ${variant === 'start' ? 'start-dock' : ''}`}>
    <PixelCompanion state={companionState} hasImage={Boolean(images.length || attachments.length)} inputActive={inputActive} inputGaze={inputGaze} onFocusInput={focusQuestion} />
    <form className={`composer ${variant === 'start' ? 'start-composer' : ''} ${images.length || attachments.length || imageBusy || imageError ? 'has-attachment' : ''}`} onSubmit={submit}>
      {images.length || attachments.length ? <div className="composer-attachments">
        {images.map((image, index) => <div className="composer-attachment" key={`${image.name}-${index}`}><img src={image.dataUrl} alt="待分析图片预览" /><span><strong>{image.name}</strong><small>图片</small></span><button type="button" aria-label={`移除图片：${image.name}`} onClick={() => setImages(current => current.filter((_, i) => i !== index))} disabled={disabled || imageBusy}><X size={14} /></button></div>)}
        {attachments.map(file => <div className="composer-attachment" key={file.id}><FileText size={22} /><span><strong>{file.name}</strong><small>已读取 {file.text.length} 字符</small></span><button type="button" aria-label={`移除文件：${file.name}`} onClick={() => setAttachments(current => current.filter(item => item.id !== file.id))} disabled={disabled || imageBusy}><X size={14} /></button></div>)}
      </div> : null}
      {imageBusy ? <div className="composer-attachment-status" role="status">正在读取附件正文…</div> : null}
      {imageError ? <div className="composer-attachment-status error" role="alert">{imageError}</div> : null}
      <input ref={fileInputRef} className="composer-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,.txt,.md,.csv,.pdf,.docx" onChange={selectFiles} disabled={disabled || imageBusy} />
      <button type="button" className="composer-icon" aria-label="添加图片或文件" title="添加图片、TXT、MD、CSV、文本型 PDF 或 DOCX；最多 4 个，每个 5MB" onClick={() => fileInputRef.current?.click()} disabled={disabled || imageBusy}>
        <Plus size={19} strokeWidth={1.5} />
      </button>
      <input
        ref={questionInputRef}
        value={value}
        onChange={(event) => { setValue(event.target.value); setInputEngaged(true) }}
        onFocus={() => { if (!isAuthenticated) openAuthModal('login'); else setInputFocused(true) }}
        onBlur={() => { setInputFocused(false); setInputEngaged(false) }}
        onPointerDown={() => setInputEngaged(true)}
        onKeyDown={(event) => {
          setInputEngaged(true)
          if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault()
        }}
        placeholder="问汉服，也可以从一件衣裳开始"
        aria-label="输入你的问题"
        disabled={disabled}
        readOnly={!isAuthenticated}
        autoFocus={variant === 'start' && isAuthenticated}
      />
      <button
        type="button"
        className={`web-search-toggle ${webSearch ? 'active' : ''}`}
        aria-pressed={webSearch}
        title="开启后联网搜索；关闭时仅使用当前对话和知识库，不查询网页"
        disabled={disabled}
        onClick={() => onWebSearchChange(!webSearch)}
      >
        <span>联网搜索</span>
      </button>
      <button type="submit" className="send-button" aria-label="发送" disabled={(!value.trim() && !images.length && !attachments.length) || disabled || imageBusy}>
        <ArrowUp size={20} strokeWidth={1.7} />
      </button>
    </form>
    {variant === 'start' && spirit.almanac ? <div className="spirit-daily"><button type="button" onClick={() => spirit.prefill(spirit.almanac!.question)}>今日可问：{spirit.almanac.term}</button>{spirit.almanac.season ? <span>{spirit.almanac.season.copy}</span> : null}</div> : null}
    </div>
  )
}
