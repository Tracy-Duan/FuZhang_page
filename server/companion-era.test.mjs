import test from 'node:test'
import assert from 'node:assert/strict'
import { eraHistory, eraReferral, eraReply, mentionsLaterEra } from './companion-era.mjs'

const user = content => ({ role: 'user', content })
const assistant = content => ({ role: 'assistant', content })

test('explicit later-era names redirect, including the reported question, without matching everyday words', () => {
  for (const question of ['你知道元朝？', '你了解元代吗', '讲讲明朝', '清代是什么', '忽必烈是谁', '宋朝后面是不是元朝', 'tell me about the Yuan dynasty']) {
    assert.equal(eraReferral([user(question)]), question)
  }
  for (const question of ['元旦快乐', '你今天有元气吗', '明天晒书吗', '清晨有风', '你知道宋朝吗', '你在做什么', '我今天有些累']) {
    assert.equal(eraReferral([user(question)]), '')
  }
})

test('ambiguous follow-ups retain the era boundary despite an old incorrect assistant reply', () => {
  const history = [user('你知道元朝？'), assistant('当然知道，元朝是忽必烈建立的。')]
  for (const question of ['那是谁建立的？', '后来呢？', '继续讲', '你刚才不是说知道吗？']) {
    const referral = eraReferral([...history, user(question)])
    assert(referral.includes('元朝') && referral.includes(question))
  }
  assert(eraReferral([...history, user('那是谁建立的？'), assistant('这个名字我不认得。'), user('然后呢？')]))
  for (const question of ['你平时抄什么书？', '讲讲你自己', '你今天开心吗']) assert.equal(eraReferral([...history, user(question)]), '')
  const switched = [...history, user('你喜欢什么纸？'), assistant('喜欢新纸的毛边。'), user('为什么呢？')]
  assert.equal(eraReferral(switched), '')
})

test('old future-era assistant messages are excluded without deleting user history or the current turn', () => {
  const messages = [user('元朝是什么'), assistant('元朝是……'), user('今天好累'), assistant('书不会跑。'), user('你好')]
  assert.deepEqual(eraHistory(messages), [messages[0], ...messages.slice(2)])
  assert.equal(messages.length, 5)
  assert(mentionsLaterEra('我听说过元世祖。'))
  assert(!mentionsLaterEra('我姓孟，书上写着孟元老。'))
  assert(eraReply('你知道元朝？').answer.includes('不认得'))
  assert(eraReply('你刚才说过', true).answer.includes('说岔了'))
})
