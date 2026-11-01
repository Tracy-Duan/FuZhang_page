/** Display terminology also applies to process traces saved by older versions. */
export function knowledgeCopy(text: string) {
  return text.replace(/本地(?:汉服资料库|汉服资料|知识库|资料库|已核来源|资料|证据|库)?/g, '专有知识库')
}
