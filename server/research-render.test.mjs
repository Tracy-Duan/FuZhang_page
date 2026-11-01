import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'

test('real renderer shows all retrieved local and web sources below each answer with independent collapsed disclosure', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const result = await build({ stdin: { contents: `
    import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
    import { ResearchView } from './src/components/ResearchView';
    export function render() {
      const sources = [{title:'Used',url:'https://example.com/used',origin:'local',excerpt:'RAG_TEXT_317'},{title:'UNCITED_RAG',url:'https://example.com/unused',origin:'local'},{title:'UNCITED_WEB',url:'https://example.com/web',origin:'web'}];
      const answer = '| 项目 | 说明 |\\n| --- | --- |\\n| 形制 | 证据[local_1]<br>第二行 |';
      return renderToStaticMarkup(React.createElement(ResearchView, {messages:[{id:'a',role:'assistant',content:answer,sources,createdAt:1},{id:'b',role:'assistant',content:'完整正文没有角标',sources,citationWarning:'正文未标注具体出处',createdAt:2}], result:{title:'旧回答',answer,sources,intent:'customize',offerDesign:true},hasDesign:true,onResumeDesign(){},onCustomize(){},onSuggestion(){} }));
    }`, resolveDir: root, loader: 'tsx' }, jsx: 'automatic', bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })
  const compiled = new Module(fileURLToPath(import.meta.url))
  compiled._compile(result.outputFiles[0].text, fileURLToPath(import.meta.url))
  const html = compiled.exports.render()
  assert.match(html, /<table>/)
  assert.match(html, /<td>证据<a class="inline-citation" href="https:\/\/example.com\/used"/)
  assert.match(html, /class="answer-table-scroll"/)
  assert.match(html, /<details class="source-disclosure">/)
  assert(html.includes('UNCITED_RAG'))
  assert(html.includes('UNCITED_WEB'))
  assert(html.includes('RAG_TEXT_317'))
  assert(html.includes('RAG'))
  assert(html.includes('联网检索'))
  assert(html.includes('正文未标注'))
  assert.equal((html.match(/<details class="source-disclosure">/g) || []).length, 2)
  assert(!html.includes('<details class="source-disclosure" open'))
  assert(html.includes('<br/>'))
  assert(!html.includes('&lt;br&gt;'))
  assert(!html.includes('以此为据开始设计'))
  assert(!html.includes('继续查看已生成方案'))
  assert(!html.includes('定制汉服'))
})
