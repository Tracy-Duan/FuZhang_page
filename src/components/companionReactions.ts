export type ReactionKind =
  | 'shake' | 'fling' | 'hold' | 'poke' | 'hover' | 'high'
  | 'done' | 'copy' | 'cite' | 'history' | 'web' | 'image' | 'design' | 'clear' | 'late'

export const isDirectReaction = (kind: ReactionKind) => ['shake', 'fling', 'hold', 'poke', 'hover', 'high'].includes(kind)

interface Line {
  text: string
  night?: boolean
  once?: boolean
}

const lines: Record<ReactionKind, Line[]> = {
  shake: [
    { text: '你干嘛。' },
    { text: '别晃……字要掉了。' },
    { text: '再晃，书页就散了。' },
    { text: '我站不稳。' },
    { text: '……轻点。' },
  ],
  fling: [
    { text: '……我还没站稳。' },
    { text: '你把我扔哪儿？' },
    { text: '落地了。' },
    { text: '……头晕。' },
  ],
  hold: [
    { text: '……你抓着我做什么。' },
    { text: '手松开。' },
    { text: '我又不会跑。' },
  ],
  poke: [
    { text: '别闹，页边要皱了。' },
    { text: '再点，我就合上了。' },
    { text: '……你手很闲？' },
  ],
  hover: [
    { text: '……你看我做什么。' },
    { text: '有事就说。' },
    { text: '我脸上有字？' },
  ],
  high: [
    { text: '这里高。……你别松手。' },
    { text: '我够到上面了。', once: true },
    { text: '上面风大。' },
  ],
  done: [
    { text: '这一页翻过去了。' },
    { text: '读完了？' },
    { text: '记下了。' },
    { text: '夜深了，别读太久。', night: true },
  ],
  copy: [
    { text: '要收起来吗？' },
    { text: '抄下来了。' },
    { text: '这句话值得留。' },
    { text: '……别抄错字。' },
  ],
  cite: [
    { text: '原文在那边。' },
    { text: '看原文好。' },
    { text: '出处比我可靠。' },
  ],
  history: [
    { text: '旧页。' },
    { text: '又翻回去了？' },
    { text: '上次停在这里。' },
  ],
  web: [
    { text: '要出门看看？' },
    { text: '外面的事，我不熟。' },
    { text: '记得回来。' },
  ],
  image: [
    { text: '我看看。' },
    { text: '这衣裳……' },
    { text: '图我看不清。' },
  ],
  design: [
    { text: '要做衣裳了？', once: true },
    { text: '我可不会裁。' },
    { text: '做坏了别怪我。' },
  ],
  clear: [
    { text: '都收起来了。' },
    { text: '……不留了吗？' },
    { text: '空白的书，也能重写。' },
  ],
  late: [
    { text: '这么晚还问。' },
    { text: '灯芯要烧完了。' },
    { text: '明日再看，也不迟。' },
  ],
}

/** How often each kind stays silent instead of speaking. */
const silentChance: Partial<Record<ReactionKind, number>> = {
  done: .7, hover: .35, cite: .5, web: .4, image: .4, history: .5,
  shake: .15, poke: .2, high: .3, clear: .2, design: .2, copy: .25, late: .3, hold: .2, fling: .15,
}

export const speechGapMs = 5_000
export const archiveGapMs = 45_000

export const kindCooldownMs: Record<ReactionKind, number> = {
  shake: 12_000, fling: 15_000, hold: 25_000, poke: 15_000, hover: 45_000, high: 0,
  done: 40_000, copy: 25_000, cite: 60_000, history: 30_000, web: 45_000, image: 45_000,
  design: 0, clear: 0, late: 60_000,
}

export const archivedKinds = new Set<ReactionKind>(['shake', 'fling', 'hold', 'poke', 'high', 'done', 'copy', 'clear', 'design', 'late'])

export function pickReaction(
  kind: ReactionKind,
  options: { night: boolean; recent: string[]; onceSeen: Set<string> },
): Line | undefined {
  const bank = lines[kind]
  if (!bank.length) return undefined
  // Deliberate user gestures always get an acknowledgement. Ambient chatter may stay silent.
  if (!isDirectReaction(kind) && Math.random() < (silentChance[kind] ?? .12)) return undefined
  const usable = bank.filter((line) => (!line.night || options.night) && (!line.once || !options.onceSeen.has(kind)))
  const fresh = usable.filter((line) => !options.recent.includes(line.text))
  const pool = fresh.length ? fresh : usable
  if (!pool.length) return undefined
  return pool[Math.floor(Math.random() * pool.length)]
}
