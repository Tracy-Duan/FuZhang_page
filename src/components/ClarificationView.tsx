import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { FormEvent, useState } from 'react'
import type { CustomizationForm } from '../types'

const emptyForm: CustomizationForm = {
  dynasty: '',
  form: '',
  occasion: '',
  season: '',
  restoration: '据典新作',
  style: '',
  colors: '',
  hometown: '',
  birthSeason: '',
  motif: '',
}

interface ClarificationViewProps {
  originalRequest: string
  assistantMessage?: string
  initialValues?: Partial<CustomizationForm>
  onComplete: (form: CustomizationForm) => void
  onBack: () => void
}

export function ClarificationView({ originalRequest, assistantMessage, initialValues, onComplete, onBack }: ClarificationViewProps) {
  const [form, setForm] = useState<CustomizationForm>(() => ({
    ...emptyForm,
    ...initialValues,
    restoration: initialValues?.restoration || emptyForm.restoration,
  }))

  function update(key: keyof CustomizationForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onComplete(form)
  }

  return (
    <article className="clarify-view page-enter">
      <div className="page-back-row">
        <button className="page-back-button" type="button" onClick={onBack}><ArrowLeft size={15} />返回对话</button>
      </div>
      <div className="answer-head compact">
        <span className="assistant-mark">服</span>
        <div>
          <p className="assistant-name">服章</p>
          <h1>再了解你一次，就开始设计</h1>
        </div>
      </div>
      <p className="clarify-intro">{assistantMessage || `我已经记下你的需求“${originalRequest}”，并预填了其中能够明确识别的信息。`} 以下内容会在这一次集中补全；生辰与家乡只用于节气、地域和个人文化意象，不用于命理判断。</p>

      <form className="clarify-form" onSubmit={submit}>
        <fieldset>
          <legend>穿着与形制</legend>
          <div className="form-grid">
            <label>参考朝代<input placeholder="如：唐代；不确定可留空" value={form.dynasty} onChange={(e) => update('dynasty', e.target.value)} /></label>
            <label>意向形制<input placeholder="如：齐胸襦裙；不确定可留空" value={form.form} onChange={(e) => update('form', e.target.value)} /></label>
            <label>使用场景<input placeholder="如：婚礼、旅行或日常穿着" value={form.occasion} onChange={(e) => update('occasion', e.target.value)} /></label>
            <label>季节<input placeholder="如：初秋" value={form.season} onChange={(e) => update('season', e.target.value)} /></label>
            <label>还原程度
              <select value={form.restoration} onChange={(e) => update('restoration', e.target.value)}>
                <option>史据复原</option><option>据典新作</option><option>汉元素创作</option>
              </select>
            </label>
            <label>气质关键词<input placeholder="如：轻盈、明快" value={form.style} onChange={(e) => update('style', e.target.value)} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>个人文化线索 <span>选填</span></legend>
          <div className="form-grid">
            <label>偏好颜色<input placeholder="如：石榴红、杏黄" value={form.colors} onChange={(e) => update('colors', e.target.value)} /></label>
            <label>家乡或成长地<input placeholder="选填" value={form.hometown} onChange={(e) => update('hometown', e.target.value)} /></label>
            <label>出生时节<input placeholder="选填，如：小暑前后" value={form.birthSeason} onChange={(e) => update('birthSeason', e.target.value)} /></label>
            <label>喜欢的意象<input placeholder="选填，如：宝相花" value={form.motif} onChange={(e) => update('motif', e.target.value)} /></label>
          </div>
          <p className="privacy-note"><Info size={14} /> 这些信息会随本次方案保存在当前浏览器的本地历史记录中。你可以留空，不影响方案生成。</p>
        </fieldset>

        <div className="form-submit-row">
          <p>提交后不会再次发起正式问询，仍可在右侧随时修改。</p>
          <button className="primary-action" type="submit">生成据典方案 <ArrowRight size={17} /></button>
        </div>
      </form>
    </article>
  )
}
