import './test-corpus-fixture.mjs'
// Test-only real credentials and isolated storage; never used by the application.
import { after } from 'node:test'
import { rm, rmdir } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
const directory = mkdtempSync(path.join(tmpdir(), 'fuzhang-api-auth-'))
process.env.AUTH_USERS_FILE = path.join(directory, 'users.json')
process.env.AUTH_SECRET = `test-only-${randomUUID()}`
process.env.INVITE_CODES = 'TESTAB'
const auth = await import('./auth.mjs')
export const fixtureAuth = auth
const account = await auth.registerUser({ username: 'api_fixture', password: 'fixture-password', inviteCode: 'TESTAB' })
export const testAuthorization = `Bearer ${account.session.token}`
export const { handleApi: rawApi } = await import('./dev.mjs')
export function authenticatedApi(req, res) {
  req.headers = { ...req.headers, authorization: testAuthorization }
  return rawApi(req, res)
}
after(async () => { await rm(path.join(directory, 'users.json'), { force: true }); await rmdir(directory) })
