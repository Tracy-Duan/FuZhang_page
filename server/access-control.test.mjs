import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHmac } from 'node:crypto'
import { rawApi, testAuthorization, fixtureAuth } from './test-auth-fixture.mjs'
const { authenticatedUser, loginUser } = fixtureAuth

const routes = [
  ['POST','/api/chat'], ['POST','/api/chat/stream'], ['POST','/api/companion/chat'],
  ['POST','/api/attachments/extract'], ['GET','/api/companion/almanac'],
  ['GET','/api/knowledge?category=forms'], ['GET','/api/knowledge?category=stories'],
  ['GET','/api/knowledge?category=research'], ['GET','/api/health'],
  ['GET','/api/asset?url=https://example.com/test'], ['POST','/api/image'], ['POST','/api/future-feature'],
]
function signed(payload) {
  const text = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${text}.${createHmac('sha256',process.env.AUTH_SECRET).update(text).digest('base64url')}`
}
async function request(method,url,authorization) {
  let status,body
  const req = { method,url,headers:{host:'localhost',...(authorization?{authorization}:{})}, [Symbol.asyncIterator]() { throw new Error('Unauthorized body must not be read') } }
  await rawApi(req,{writeHead(code){status=code},end(value){body=JSON.parse(value)}})
  return {status,body}
}
test('every business route denies guests and invalid sessions before body reads or upstream work',async()=>{
  const previous=globalThis.fetch
  let upstream=0
  globalThis.fetch=async()=>{upstream++;throw new Error('Must not call upstream')}
  try {
    for(const [method,url] of routes) for(const credential of [undefined,'Bearer local-token-fake','Bearer broken.token',testAuthorization+'.extra']) {
      const result=await request(method,url,credential)
      assert.equal(result.status,401,`${method} ${url}`)
      assert.equal(result.body.code,'AUTH_REQUIRED')
    }
    assert.equal(upstream,0)
  } finally {globalThis.fetch=previous}
})
test('signed expired, missing-expiry, unknown-user and mismatched-user tokens are denied',async()=>{
  const payload=JSON.parse(Buffer.from(testAuthorization.slice(7).split('.')[0],'base64url'))
  for(const replacement of [{expiresAt:Date.now()-1},{expiresAt:null},{username:'missing-user'},{userId:'other-user'},{sessionId:null}]) {
    assert.equal((await request('GET','/api/health',`Bearer ${signed({...payload,...replacement})}`)).status,401)
  }
  assert.equal((await request('GET',`/api/health?token=${encodeURIComponent(testAuthorization.slice(7))}`)).status,401)
})
test('real HTTP keeps registration/login public and accepts a real session for protected data',async()=>{
  const server=createServer((req,res)=>{void rawApi(req,res).catch(()=>{res.writeHead(500);res.end('{}')})})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const base=`http://127.0.0.1:${server.address().port}`
  try {
    const guest=await fetch(base+'/api/knowledge?category=forms')
    assert.equal(guest.status,401)
    assert.equal(guest.headers.get('set-cookie'),null)
    const registration=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'http_gate_reader',password:'fixture-password',inviteCode:'TESTAB'})})
    assert.equal(registration.status,200)
    const {session}=await registration.json()
    const header={Authorization:`Bearer ${session.token}`}
    const library=await fetch(base+'/api/knowledge?category=forms',{headers:header})
    assert.equal(library.status,200)
    assert((await library.json()).items.length>0)
    const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:header})
    assert.equal(logout.status,200)
    assert.equal((await fetch(base+'/api/knowledge?category=forms',{headers:header})).status,401)
    assert.equal((await fetch(base+'/api/auth/me',{headers:header})).status,401)
    const reloaded=await import('./auth.mjs?revocation-persistence-test')
    assert.equal(await reloaded.authenticatedUser({headers:{authorization:header.Authorization}}),null)
    const fresh=await loginUser({username:'http_gate_reader',password:'fixture-password'})
    assert(await authenticatedUser({headers:{authorization:`Bearer ${fresh.session.token}`}}))
  } finally {await new Promise(resolve=>server.close(resolve))}
})
