// These are explicit topic cues, not a claim to identify every post-Song fact.
const laterEra = /元(?:朝|代|世祖|杂剧|曲)|大元(?:王朝|帝国)|明(?:朝|代|太祖|成祖)|清(?:朝|代|太祖|太宗)|民国|中华人民共和国|近现代|近代史|现代史|忽必烈|朱元璋|朱棣|努尔哈赤|皇太极|康熙|雍正|乾隆|嘉庆|道光|咸丰|同治|光绪|宣统|慈禧|溥仪|洪武|永乐|\b(?:yuan|ming|qing)\s+(?:dynasty|empire)\b|\bkublai(?:\s+khan)?\b/i
const short = (text, limit = 500) => Array.from(String(text || '').replace(/\s+/g, ' ').trim()).slice(0, limit).join('')

export function mentionsLaterEra(text) { return laterEra.test(String(text || '')) }

function isFollowup(text) {
  const q = String(text).replace(/[，,。！？!?；;：:\s]/g, '')
  if (/你自己|你的书铺|你抄书|你晒书|你小时候|你平时/.test(q)) return false
  return /^(?:(?:那|那么|所以)?(?:它|他|她|这位|那位|这个|那个)?(?:是)?(?:谁|哪|什么时候|怎么|如何|为什么|为啥|后来|接下来|之后)|后来呢|然后呢|再后来|继续|接着|再说|再讲|讲讲|说说|展开|你(?:刚才|之前|上次)(?:不是)?(?:说|知道|讲|提到)|你不是(?:知道|说))/.test(q)
}

export function eraReferral(messages) {
  const question = messages.at(-1)?.content || ''
  if (mentionsLaterEra(question)) return short(question)
  if (!isFollowup(question)) return ''
  let lastAssistantTopic = ''
  for (let i = messages.length - 2; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'assistant') {
      if (!lastAssistantTopic && mentionsLaterEra(message.content)) lastAssistantTopic = message.content
      continue
    }
    if (mentionsLaterEra(message.content) || lastAssistantTopic) {
      return `${short(mentionsLaterEra(message.content) ? message.content : lastAssistantTopic, 240)}；${short(question, 250)}`
    }
    // A new substantive topic ends the old era topic; do not block casual follow-ups.
    if (!isFollowup(message.content)) return ''
  }
  return ''
}

export function eraReply(question, correction = false) {
  return { answer: correction ? '那句是我说岔了。这个名字我不认得，去问大服章吧。' : '这个名字我不认得。问大服章吧，我不乱说。', referral: short(question) }
}

export function eraHistory(messages) {
  return messages.filter(message => message.role !== 'assistant' || !mentionsLaterEra(message.content))
}
