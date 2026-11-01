import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'

async function historyApi() {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/history.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })
  const compiled = new Module(fileURLToPath(import.meta.url))
  compiled._compile(result.outputFiles[0].text, fileURLToPath(import.meta.url))
  return compiled.exports
}

test('legacy design views reopen as readable chat while preserving generated records and sources', async () => {
  const { loadHistory, saveHistory } = await historyApi()
  const previousWindow = globalThis.window
  const stored = ['clarify', 'design', 'preview', 'document'].map((view, index) => ({
    id: view, title: '旧记录', question: '原始提问', view, createdAt: index, updatedAt: index,
    research: { intent: 'customize', answer: '已有回答[1](https://example.com/source)', title: '原始回答', sources: [{ title: '原始来源', url: 'https://example.com/source' }], offerDesign: true, customizationDraft: { colors: '灰绿色' } },
    design: { title: '已生成方案', summary: '保留原方案' },
    form: { colors: '灰绿色' }, imageUrl: 'https://example.com/old.png', imageViews: { front: 'https://example.com/old.png' }, threeD: { taskId: 'old-task' },
  }))
  let value = JSON.stringify(stored)
  globalThis.window = { localStorage: { getItem() { return value }, setItem(key, next) { assert.equal(key, 'yijing.history.v1');value = next } } }
  try {
    const items = loadHistory()
    assert.equal(items.length, 4)
    for (const item of items) {
      assert.equal(item.view, 'research')
      assert.equal(item.messages[0].content, '原始提问')
      assert.equal(item.messages[1].content, item.research.answer)
      assert.equal(item.messages[1].sources[0].url, 'https://example.com/source')
      for (const field of ['intent', 'customizationDraft', 'offerDesign']) assert(!Object.hasOwn(item.research, field))
      assert.equal(item.form.colors, '灰绿色')
      assert.equal(item.design.summary, '保留原方案')
      assert.equal(item.imageUrl, 'https://example.com/old.png')
      assert.equal(item.threeD.taskId, 'old-task')
    }
    saveHistory(items)
    assert.deepEqual(loadHistory(), items)
  } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow }
})
