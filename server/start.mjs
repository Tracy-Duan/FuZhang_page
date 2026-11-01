import { createServer } from 'node:http'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './dev.mjs'

export function validateProductionEnvironment(environment = process.env) {
  if (!environment.DASHSCOPE_API_KEY?.trim()) throw new Error('缺少 DASHSCOPE_API_KEY，请在服务器私密环境文件中填写。')
  if ((environment.AUTH_SECRET?.trim().length || 0) < 32) throw new Error('AUTH_SECRET 至少需要32个字符，请使用随机生成的固定密钥。')
}

// Only the API is served here. Nginx must serve dist/, never the project root.
export async function startProductionServer({ port = Number(process.env.PORT || 3001), host = process.env.HOST?.trim() || '127.0.0.1' } = {}) {
  validateProductionEnvironment()
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 必须是有效端口号。')
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('生产后端只监听本机，请通过 Nginx 提供访问。')
  const server = createServer(async (req, res) => {
    try {
      if ((req.url || '').startsWith('/api/')) { await handleApi(req, res); return }
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ error: '接口不存在' }))
    } catch (error) {
      console.error('API request failed:', error.message)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ error: '服务器暂时无法处理请求，请稍后重试' }))
      } else res.end()
    }
  })
  server.headersTimeout = 15_000
  server.requestTimeout = 60_000
  server.keepAliveTimeout = 5_000
  server.listen(port, host)
  await once(server, 'listening')
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await startProductionServer()
    console.log(`服章生产 API 已启动：${server.address().address}:${server.address().port}`)
    let stopping = false
    const stop = () => {
      if (stopping) return
      stopping = true
      server.close(() => process.exit(0))
      setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 30_000).unref()
    }
    process.on('SIGTERM', stop); process.on('SIGINT', stop)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
