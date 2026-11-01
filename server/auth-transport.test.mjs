import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/components/auth/session.ts',import.meta.url),'utf8')
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {authenticatedFetch,SESSION_KEY,AUTH_EXPIRED_EVENT}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'))
const original={fetch:globalThis.fetch,window:globalThis.window,localStorage:globalThis.localStorage}
after(()=>{Object.assign(globalThis,original)})
test('all business transports attach the session header without placing credentials in URLs',async()=>{
  const values=new Map([[SESSION_KEY,JSON.stringify({token:'fixture-session-token'})]])
  globalThis.localStorage={getItem:k=>values.get(k),removeItem:k=>values.delete(k)}
  globalThis.window=new EventTarget()
  let calls=0
  globalThis.fetch=async(url,options)=>{
    assert(url.startsWith('/api/'));assert(!url.includes('fixture-session-token'))
    assert.equal(options.headers.get('Authorization'),'Bearer fixture-session-token')
    calls++;return new Response('{}',{status:200})
  }
  for(const route of ['/api/chat/stream','/api/companion/chat','/api/attachments/extract','/api/knowledge','/api/companion/almanac'])await authenticatedFetch(route)
  assert.equal(calls,5)
  await assert.rejects(authenticatedFetch('https://example.com/api/test'),/凭据只能发送/)
  assert.equal(calls,5)
})
test('401 clears the cached session and notifies the UI to return to login',async()=>{
  const values=new Map([[SESSION_KEY,JSON.stringify({token:'expired-token'})]])
  globalThis.localStorage={getItem:k=>values.get(k),removeItem:k=>values.delete(k)}
  globalThis.window=new EventTarget()
  let expired=0;window.addEventListener(AUTH_EXPIRED_EVENT,()=>expired++)
  globalThis.fetch=async()=>new Response('{"code":"AUTH_REQUIRED"}',{status:401})
  assert.equal((await authenticatedFetch('/api/knowledge')).status,401)
  assert.equal(values.has(SESSION_KEY),false);assert.equal(expired,1)
})
