import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

test('an absent explicitly configured private corpus never falls back to local data', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', "const r = await import('./server/rag.mjs'); console.log(JSON.stringify(await r.getHanfuRagStatus()))"], {
    cwd: new URL('../', import.meta.url), windowsHide: true, encoding: 'utf8',
    env: { ...process.env, HANFU_RAG_DATA_DIR: path.join(tmpdir(), `absent-corpus-${randomUUID()}`) },
  })
  const status = JSON.parse(output)
  assert.equal(status.available, false)
  assert.equal(status.passageCount, 0)
  assert.match(status.error, /私有知识库/)
})
