import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { extractAttachment } from './attachments.mjs'

function fixture(code) {
  const result = spawnSync(process.env.FUZHANG_PYTHON || 'python', ['-c', code], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
test('text PDF is actually parsed, while a scanned/blank PDF is rejected', async () => {
  const create = text => `import io,base64; from reportlab.pdfgen import canvas; b=io.BytesIO(); c=canvas.Canvas(b); c.drawString(72,72,${JSON.stringify(text)}); c.showPage(); c.save(); print(base64.b64encode(b.getvalue()).decode())`
  const parsed = await extractAttachment({ name: 'material.pdf', base64: fixture(create('PDF_MATERIAL_173')) })
  assert.match(parsed.text, /PDF_MATERIAL_173/)
  await assert.rejects(extractAttachment({ name: 'scan.pdf', base64: fixture(create('')) }), /扫描|OCR/)
})
test('DOCX body text is extracted without treating filename as document content', async () => {
  const base64 = fixture(`import io,zipfile,base64; b=io.BytesIO(); z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED); z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX_MATERIAL_173</w:t></w:r></w:p></w:body></w:document>'); z.close(); print(base64.b64encode(b.getvalue()).decode())`)
  const result = await extractAttachment({ name: 'material.docx', base64 })
  assert.equal(result.text, 'DOCX_MATERIAL_173')
})
test('unsupported, invalid, oversized, and broken documents return actionable errors', async () => {
  await assert.rejects(extractAttachment({ name: 'a.doc', base64: 'eA==' }), /仅支持/)
  await assert.rejects(extractAttachment({ name: 'a.pdf', base64: '*' }), /无效/)
  await assert.rejects(extractAttachment({ name: 'a.pdf', base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }), /5MB/)
  await assert.rejects(extractAttachment({ name: 'a.pdf', base64: Buffer.from('not pdf').toString('base64') }), /有效的 PDF/)
})
