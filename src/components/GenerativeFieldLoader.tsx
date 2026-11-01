import { useEffect, useRef, useState } from 'react'

interface GenerativeFieldLoaderProps {
  title: string
  detail: string
  active?: boolean
  compact?: boolean
  mode?: 'image' | 'three-d'
}

const imageStages = ['正在构思形制', '正在铺陈色彩', '正在刻画纹样', '正在调整画面细节', '即将完成']
const threeDStages = ['正在解析衣装轮廓', '正在估算衣片层次', '正在构建立体结构', '正在调整材质光影', '即将完成']

export function GenerativeFieldLoader({
  title,
  detail,
  active = true,
  compact = false,
  mode = 'image',
}: GenerativeFieldLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stageIndex, setStageIndex] = useState(0)
  const stages = mode === 'three-d' ? threeDStages : imageStages
  const stage = active ? stages[stageIndex] : title

  useEffect(() => {
    if (!active) return
    setStageIndex(0)
    const timer = window.setInterval(() => {
      setStageIndex((value) => Math.min(value + 1, stages.length - 1))
    }, 4700)
    return () => window.clearInterval(timer)
  }, [active, mode, stages.length])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let width = 0
    let height = 0
    let pixelRatio = 1
    let lastDrawAt = 0

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    const draw = (time: number) => {
      if (active && !reducedMotion.matches && time - lastDrawAt < 30) {
        frame = window.requestAnimationFrame(draw)
        return
      }
      lastDrawAt = time
      const t = active && !reducedMotion.matches ? (time / 1000) * 1.18 : 4.6
      context.clearRect(0, 0, width, height)

      const spacing = compact ? 9.5 : 10.5
      const columns = Math.max(24, Math.ceil(width / spacing) + 1)
      const rows = Math.max(24, Math.ceil(height / spacing) + 1)

      for (let row = 0; row < rows; row += 1) {
        const ny = rows === 1 ? 0.5 : row / (rows - 1)
        const y = ny * height

        for (let column = 0; column < columns; column += 1) {
          const nx = column / (columns - 1)
          const x = nx * width

          const centerAX = 0.28 + Math.sin(t * 0.42) * 0.18
          const centerAY = 0.32 + Math.cos(t * 0.36) * 0.2
          const centerBX = 0.72 + Math.cos(t * 0.31 + 1.3) * 0.2
          const centerBY = 0.68 + Math.sin(t * 0.38 + 0.6) * 0.2
          const centerCX = 0.5 + Math.sin(t * 0.24 + 2.2) * 0.24
          const centerCY = 0.5 + Math.cos(t * 0.29 + 1.8) * 0.25

          const distanceA = (nx - centerAX) ** 2 + (ny - centerAY) ** 2
          const distanceB = (nx - centerBX) ** 2 + (ny - centerBY) ** 2
          const distanceC = (nx - centerCX) ** 2 + (ny - centerCY) ** 2
          const fieldA = Math.exp(-distanceA / 0.052)
          const fieldB = Math.exp(-distanceB / 0.06)
          const fieldC = Math.exp(-distanceC / 0.035) * 0.72
          const ripple = (Math.sin(nx * 12.5 - ny * 8.4 + t * 1.1) + 1) * 0.055
          const ambient = 0.055 + (Math.sin(nx * 5.7 + ny * 4.4 - t * 0.35) + 1) * 0.018
          const energy = Math.min(1, ambient + fieldA * 0.88 + fieldB * 0.82 + fieldC + ripple)

          const radius = 0.62 + energy * (compact ? 1.65 : 1.9)
          const alpha = 0.13 + energy * 0.68
          const hot = Math.max(0, (energy - 0.72) / 0.28)
          const red = Math.round(112 + energy * 48 + hot * 28)
          const green = Math.round(124 - energy * 61 + hot * 35)
          const blue = Math.round(114 - energy * 54 + hot * 10)

          context.beginPath()
          context.arc(x, y, radius, 0, Math.PI * 2)
          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`
          context.shadowColor = energy > 0.68 ? `rgba(167, 70, 57, ${energy * 0.28})` : 'transparent'
          context.shadowBlur = energy > 0.68 ? 5 : 0
          context.fill()
        }
      }

      context.shadowBlur = 0
      if (active && !reducedMotion.matches) frame = window.requestAnimationFrame(draw)
    }

    const observer = new ResizeObserver(() => {
      resize()
      if (reducedMotion.matches || !active) draw(0)
    })
    observer.observe(canvas)
    resize()
    draw(performance.now())

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [active, compact, mode])

  return (
    <div
      className={`generative-field-loader ${active ? 'is-active' : 'is-still'} ${compact ? 'is-compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`${stage}。${detail}`}
    >
      <div className="generative-stage">
        <span aria-hidden="true" />
        <strong>{stage}</strong>
      </div>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  )
}
