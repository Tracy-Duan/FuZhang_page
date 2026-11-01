import { mkdir, cp, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
const target = join(root, 'out', 'deploy', `fuzhang-${stamp}`)
await mkdir(join(root, 'out', 'deploy'), { recursive: true })
await mkdir(target)
const files = [
  'system_prompt_Aruo.md', 'server/start.mjs', 'server/dev.mjs', 'server/auth.mjs',
  'server/rag.mjs', 'server/knowledge-library.mjs', 'server/library-archive.mjs',
  'server/companion.mjs', 'server/companion-era.mjs', 'server/companion-calendar.json',
  'server/chat-intent.mjs', 'server/chat-routing.mjs', 'server/answer-evidence.mjs',
  'server/attachments.mjs', 'server/extract_attachment.py', 'server/requirements-attachments.txt',
  'LICENSE', 'THIRD_PARTY_LICENSES.txt', 'THIRD_PARTY_NOTICES.md', 'ASSETS.md',
  'deploy/init-env.mjs', 'deploy/.env.production.example', 'deploy/nginx-api.conf', 'deploy/README.md',
]
for (const file of files) { await mkdir(dirname(join(target, file)), { recursive: true }); await cp(join(root, file), join(target, file)) }
await cp(join(root, 'dist'), join(target, 'dist'), { recursive: true })
const runtime = JSON.parse(await readFile(join(root, 'deploy/runtime-package.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
const dependency = lock.packages['node_modules/opencc-js']
if (!dependency || dependency.dependencies && Object.keys(dependency.dependencies).length) throw new Error('Runtime dependency changed; review the release lockfile builder.')
await writeFile(join(target, 'package.json'), JSON.stringify(runtime, null, 2) + '\n')
const rootLock = { name: runtime.name, version: runtime.version, dependencies: runtime.dependencies, engines: runtime.engines, license: runtime.license }
await writeFile(join(target, 'package-lock.json'), JSON.stringify({ name: runtime.name, version: runtime.version, lockfileVersion: 3, requires: true, packages: { '': rootLock, 'node_modules/opencc-js': dependency } }, null, 2) + '\n')
const manifest = {}
async function scan(folder, relative = '') {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name), name = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) await scan(path, name)
    else {
      if (entry.name === 'users.json' || entry.name === '.env.local' || entry.name.endsWith('.test.mjs')) throw new Error(`Private or test-only file in release: ${name}`)
      manifest[name] = { bytes: (await stat(path)).size, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }
    }
  }
}
await scan(target)
await writeFile(join(target, 'release-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), files: manifest }, null, 2))
console.log(`Release directory: ${target}`)
console.log(`Files: ${Object.keys(manifest).length}; excludes secrets, accounts, source backups and test fixtures.`)
