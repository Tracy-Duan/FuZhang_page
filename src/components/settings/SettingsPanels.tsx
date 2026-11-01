import { useState, type ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useBookSpirit } from '../bookSpiritStore'
import { BrandLogo } from '../BrandLogo'

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="fz-settings-row"><div className="fz-settings-row-label"><span>{title}</span>{description ? <small>{description}</small> : null}</div><div className="fz-settings-control">{children}</div></div>
}
function SettingSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" className="fz-settings-switch" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
}
function ColorChoice<T extends string>({ label, value, choices, onChange }: { label: string; value: T; choices: readonly (readonly [T, string, string])[]; onChange: (value: T) => void }) {
  return <div className="fz-settings-swatches" role="group" aria-label={label}>{choices.map(([color, name, hex]) => <button key={color} type="button" aria-pressed={value === color} onClick={() => onChange(color)} aria-label={name}>
    <span className="fz-settings-swatch" style={{ backgroundColor: hex }}>{value === color ? <Check size={15} strokeWidth={1.8} /> : null}</span><small>{name}</small>
  </button>)}</div>
}

export function CompanionPreferences({ close }: { close: () => void }) {
  const spirit = useBookSpirit()
  const { preferences: p } = spirit
  return <>
    <div className="fz-settings-rows">
      <SettingRow title="叫她什么"><input className="fz-settings-input" aria-label="阿箬的名字" maxLength={12} value={p.name} onChange={event => spirit.updatePreferences({ name: event.target.value })} onBlur={() => { if (!p.name.trim()) spirit.updatePreferences({ name: '阿箬' }) }} /></SettingRow>
      <SettingRow title="书封"><ColorChoice label="书封" value={p.cover} choices={[[ 'sage', '灰绿', '#829578'], ['indigo', '黛蓝', '#7c8e9a'], ['tea', '茶褐', '#a28c6f']]} onChange={cover => spirit.updatePreferences({ cover })} /></SettingRow>
      <SettingRow title="书签"><ColorChoice label="书签" value={p.ribbon} choices={[[ 'cinnabar', '朱砂', '#b64e36'], ['ochre', '赭金', '#aa7b37'], ['plum', '藕荷', '#956079']]} onChange={ribbon => spirit.updatePreferences({ ribbon })} /></SettingRow>
      <SettingRow title="性格"><div className="fz-settings-segment" role="group" aria-label="性格">{([['quiet', '安静'], ['curious', '好奇'], ['lively', '活泼']] as const).map(([temperament, label]) => <button type="button" key={temperament} aria-pressed={p.temperament === temperament} onClick={() => spirit.updatePreferences({ temperament })}>{label}</button>)}</div></SettingRow>
    </div>
    <div className="fz-settings-rows fz-settings-divided">
      <SettingRow title="安静模式" description="不主动走动"><SettingSwitch label="安静模式" checked={spirit.quiet} onChange={spirit.setQuiet} /></SettingRow>
      <SettingRow title="开启动画" description="跟随你的动态效果偏好"><SettingSwitch label="开启动画" checked={spirit.animated} onChange={spirit.setAnimated} /></SettingRow>
    </div>
    <p className="fz-settings-footnote">系统开启减少动态效果时，阿箬也会安静展示。节日装扮不会改变你选的书签。</p>
    <details className="fz-settings-disclosure"><summary>陪她一会儿<ChevronDown size={17} /></summary>
      <div className="fz-settings-actions">{([['ruffle', '翻一翻'], ['stretch', '伸懒腰'], ['hop', '跳一下'], ['spin', '转一圈']] as const).map(([action, label]) => <button type="button" key={action} disabled={!spirit.animated} onClick={() => { spirit.controller.interact(action, performance.now(), p.temperament); close() }}>{label}</button>)}</div>
      <h3>小剧场</h3><p className="fz-settings-footnote">选一幕，回到书页间看她表演。{!spirit.animated ? '请先开启动画。' : ''}</p>
      <div className="fz-settings-actions fz-settings-theater">{([['airing', '晒书'], ['flutter', '抖书页'], ['paperplane', '扔纸飞机'], ['paper-chase', '追书页'], ['tidy', '整理书页'], ['ribbon-play', '甩书签'], ['hopscotch', '跳房子'], ['tower', '叠书塔'], ['chase', '追书签'], ['doze', '打瞌睡'], ['carry', '搬书'], ['stairs', '搭台阶']] as const).map(([kind, label]) => <button type="button" key={kind} disabled={!spirit.animated} onClick={() => { spirit.controller.requestTheater(kind, performance.now()); close() }}>{label}</button>)}</div>
    </details>
    <div className="fz-settings-row fz-settings-divided"><div className="fz-settings-row-label"><span>页面陪伴</span><small>{spirit.minimized ? '阿箬已暂时收起' : '阿箬会陪在页面一角'}</small></div><button type="button" className="fz-settings-button" onClick={() => { spirit.setMinimized(!spirit.minimized); close() }}>{spirit.minimized ? '唤回陪伴' : '收起陪伴'}</button></div>
  </>
}

export function ConversationData() {
  const spirit = useBookSpirit()
  const [confirmation, setConfirmation] = useState<'memory' | 'history' | null>(null)
  const [message, setMessage] = useState('')
  return <>
    <div className="fz-settings-reading"><span>一起读过的书页</span><p><strong>{spirit.reads}</strong><span>个问题</span></p></div>
    <div className="fz-settings-section"><h3>本机记录</h3><p>记录保存在当前浏览器，不会自动同步到其他设备。清除浏览器数据也会移除这些记录。</p>
      <SettingRow title="阿箬的陪聊记忆" description="最多保留120条，不包含主对话内容。"><button type="button" className="fz-settings-button" onClick={() => { setConfirmation('memory'); setMessage('') }}>清空记忆</button></SettingRow>
      <SettingRow title="主对话历史" description="清空后将返回欢迎页，不影响陪聊记忆。"><button type="button" className="fz-settings-button fz-settings-danger" onClick={() => { setConfirmation('history'); setMessage('') }}>清空历史</button></SettingRow>
    </div>
    {confirmation ? <div className="fz-settings-confirm" role="alert"><strong>{confirmation === 'memory' ? '清空阿箬的陪聊记忆？' : '清空全部主对话历史？'}</strong><p>这一步无法撤销。{confirmation === 'memory' ? '不会重置每日聊天次数。' : '本机保存的全部主对话都会被删除。'}</p><div><button type="button" className="fz-settings-button" onClick={() => setConfirmation(null)}>取消</button><button type="button" className="fz-settings-button fz-settings-danger" onClick={() => {
      if (confirmation === 'memory') spirit.clearMemory()
      else spirit.clearMainHistory.current()
      setMessage(confirmation === 'memory' ? '陪聊记忆已清空，她会从这一页重新认识你。' : '主对话历史已清空。')
      setConfirmation(null)
    }}>确认清空{confirmation === 'memory' ? '记忆' : '历史'}</button></div></div> : null}
    {message ? <p className="fz-settings-status" role="status"><Check size={16} />{message}</p> : null}
    <div className="fz-settings-section fz-settings-privacy"><h3>请求会发送什么</h3><p>陪聊仅发送最近12条陪聊消息、页面视图和标题，不发送主回答正文。服务端暂存匿名设备的每日次数，不将陪聊内容写入服务器文件。</p></div>
  </>
}

export function AboutFuzhang() {
  return <><div className="fz-settings-about-brand"><BrandLogo /><div><h3>服章</h3><p>FuuZhang · 测试版本 0.2.0</p></div></div><div className="fz-settings-section"><h3>在衣冠之间，读懂来处</h3><p>从古籍里的衣冠名物，到馆藏中的服饰参照，服章陪你查阅、提问与辨认。</p></div><div className="fz-settings-section"><h3>书页间的阿箬</h3><p>南宋临安人，二十岁，在书肆替人抄书。她住在书页之间，知道大服章很厉害，却不知道它是什么。</p></div><dl className="fz-settings-facts fz-settings-about-facts"><div><dt>名字、装扮与落点</dt><dd>保存在本机</dd></div><div><dt>账号与登录状态</dt><dd>由服务端验证</dd></div></dl><p className="fz-settings-footnote">测试版本仍在完善。历史与偏好属于当前浏览器，切换设备时不会自动带走。</p></>
}
