export type AppView = 'home' | 'research'
export type ImageStatus = 'idle' | 'generating' | 'ready' | 'error'

export interface DesignImageViews {
  front: string
  left?: string
  back?: string
  right?: string
}

export interface CustomizationForm {
  dynasty: string
  form: string
  occasion: string
  season: string
  restoration: string
  style: string
  colors: string
  hometown: string
  birthSeason: string
  motif: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  title?: string
  sources?: ResearchSource[]
  route?: 'direct' | 'rag' | 'search'
  trace?: ProcessTraceStep[]
  durationMs?: number
  citationWarning?: string
  images?: ChatImage[]
  attachments?: ChatAttachment[]
}

export interface ChatAttachment {
  id: string
  name: string
  text: string
  size: number
}

export interface ChatImage {
  name: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  dataUrl: string
  width: number
  height: number
}

export interface ProcessTraceStep {
  id: string
  phase: 'understand' | 'route' | 'search' | 'extract' | 'reasoning' | 'write' | 'complete' | 'error'
  label: string
  detail?: string
  status: 'active' | 'done' | 'error'
  createdAt: number
}

export interface HistoryItem {
  id: string
  title: string
  question: string
  titleEdited?: boolean
  createdAt: number
  updatedAt: number
  view: Exclude<AppView, 'home'>
  messages: ChatMessage[]
  research?: ResearchResult
  // Legacy generation records are retained for storage compatibility only.
  form?: CustomizationForm
  design?: DesignPlan
  imageUrl?: string
  imageViews?: DesignImageViews
  imageStatus?: ImageStatus
  threeD?: ThreeDProgress
  error?: string
}

export interface ResearchSource {
  id?: string
  title: string
  url: string
  citationIndex?: number
  trustLevel?: 'primary' | 'academic' | 'official' | 'general'
  trustLabel?: string
  reason?: string
  origin?: 'local' | 'web'
  origins?: ('local' | 'web')[]
  excerpt?: string
}

export interface ResearchResult {
  title: string
  answer: string
  sources: ResearchSource[]
  citationWarning?: string
  suggestions?: string[]
}

export interface DesignPlan {
  title: string
  summary: string
  shape: string
  colors: string
  motif: string
  fabric: string
  culturalNotes: string
  historicalBoundary: string
  imagePrompt: string
  negativePrompt?: string
  sources?: ResearchSource[]
}

export interface ThreeDProgress {
  taskId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'
  modelUrl: string
  previewUrl: string
  error: string
}
