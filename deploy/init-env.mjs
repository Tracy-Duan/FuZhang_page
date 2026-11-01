import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes, randomInt } from 'node:crypto'
const template = await readFile(new URL('./.env.production.example', import.meta.url), 'utf8')
const output = new URL('../.env.local', import.meta.url)
await writeFile(output, template.replace(/^AUTH_SECRET=$/m, `AUTH_SECRET=${randomBytes(32).toString('hex')}`).replace(/^INVITE_CODES=$/m, `INVITE_CODES=${Array.from({ length: 6 }, () => String.fromCharCode(65 + randomInt(26))).join('')}`), { flag: 'wx', mode: 0o600 })
console.log('已创建私密 .env.local，并生成固定会话密钥。请仅在服务器内填写 DASHSCOPE_API_KEY。')
