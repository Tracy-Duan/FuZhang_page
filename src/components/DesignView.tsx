import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, Box, Download, ExternalLink, FileText, RotateCcw } from 'lucide-react'
import { GenerativeFieldLoader } from './GenerativeFieldLoader'
import type { CustomizationForm, DesignImageViews, DesignPlan } from '../types'

const ThreePreview = lazy(() => import('./ThreePreview'))

function readableThreeDStatus(status: string) {
  if (status === 'PENDING') return '等待处理中'
  if (status === 'RUNNING') return '正在生成'
  if (status === 'SUCCEEDED') return '已完成'
  if (status === 'FAILED') return '生成失败'
  if (status === 'CANCELED') return '已取消'
  return '尚未开始'
}

interface DesignViewProps {
  form: CustomizationForm
  plan: DesignPlan
  imageUrl: string
  imageViews?: DesignImageViews
  imageStatus: 'idle' | 'generating' | 'ready' | 'error'
  error?: string
  modelUrl?: string
  threeDStatus: string
  threeDError?: string
  showPreview?: boolean
  showDocument?: boolean
  onViewChange: (view: 'design' | 'preview' | 'document') => void
  onBackToChat: () => void
  onEditRequirements: () => void
  onRetryThreeD?: () => void
}

export function DesignView({
  form,
  plan,
  imageUrl,
  imageViews,
  imageStatus,
  error,
  modelUrl = '',
  threeDStatus,
  threeDError,
  showPreview = false,
  showDocument = false,
  onViewChange,
  onBackToChat,
  onEditRequirements,
  onRetryThreeD,
}: DesignViewProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const threeDBusy = threeDStatus === 'PENDING' || threeDStatus === 'RUNNING'
  const reportViews = [
    { key: 'front', label: '正面视图', note: '用于确认领型、前襟、腰线、纹样主视觉与整体比例。', url: imageViews?.front || imageUrl },
    { key: 'left', label: '左侧视图', note: '用于确认袖体垂量、衣身侧线、层次厚度与裙摆轮廓。', url: imageViews?.left || '' },
    { key: 'back', label: '背面视图', note: '用于确认后领、背部结构、后摆层次与纹样延续关系。', url: imageViews?.back || '' },
  ]
  const requirementRows = [
    ['参考朝代', form.dynasty],
    ['意向形制', form.form],
    ['使用场景', form.occasion],
    ['穿着季节', form.season],
    ['还原程度', form.restoration],
    ['气质关键词', form.style],
    ['偏好颜色', form.colors],
    ['个人意象', form.motif],
    ['地域线索', form.hometown],
    ['出生时节', form.birthSeason],
  ]

  function printDocument() {
    window.print()
  }

  const backLabel = showPreview ? '返回效果图' : showDocument ? '返回设计方案' : '返回对话'
  const handleBack = showPreview || showDocument ? () => onViewChange('design') : onBackToChat

  return (
    <article className="design-view page-enter">
      <div className="page-back-row">
        <button className="page-back-button" type="button" onClick={handleBack}><ArrowLeft size={15} />{backLabel}</button>
      </div>
      <div className="design-heading">
        <div>
          <p className="assistant-name">据典新作 · 方案 01</p>
          <h1>{plan.title}</h1>
          <p>{plan.summary}</p>
        </div>
        <div className="view-switch" aria-label="成果视图">
          <button className={!showPreview && !showDocument ? 'active' : ''} onClick={() => onViewChange('design')}>设计</button>
          <button className={showPreview ? 'active' : ''} onClick={() => onViewChange('preview')}><Box size={15} />3D</button>
          <button className={showDocument ? 'active' : ''} onClick={() => onViewChange('document')}><FileText size={15} />文档</button>
        </div>
      </div>

      {showPreview ? (
        <section className="preview-layout">
          {modelUrl ? (
            <Suspense fallback={(
              <div className="three-loading" role="status" aria-live="polite">
                <GenerativeFieldLoader compact mode="three-d" title="正在展开立体预览" detail="光影与材质即将就绪" />
              </div>
            )}>
              <ThreePreview modelUrl={modelUrl} />
            </Suspense>
          ) : (
            <div className="three-canvas three-waiting" role="status" aria-live="polite">
              <GenerativeFieldLoader
                active={threeDBusy}
                mode="three-d"
                title={threeDBusy ? '正在重构立体衣形' : '立体预览尚未生成'}
                detail={threeDBusy ? '从多个视角校准轮廓、层次与材质' : '开始生成后，立体衣形会在这里逐渐呈现'}
              />
            </div>
          )}
          <div className="preview-notes">
            <h2>展示级 3D 预览</h2>
            <p>{modelUrl
              ? '当前已载入真实 GLB 文件，可旋转和缩放查看。它仍是视觉沟通模型，不构成服装纸样。'
              : threeDError || (threeDStatus === 'PENDING' || threeDStatus === 'RUNNING'
                ? '正在根据多视图效果图重建立体模型，通常需要数分钟；完成后会自动载入预览。'
                : '打开此页后会根据多视图效果图生成立体预览；完成后自动载入。')}</p>
            <dl>
              <div><dt>主色</dt><dd>{plan.colors}</dd></div>
              <div><dt>形制</dt><dd>{form.form}</dd></div>
              <div><dt>任务状态</dt><dd>{readableThreeDStatus(threeDStatus)}</dd></div>
              <div><dt>定位</dt><dd>视觉沟通，不用于打板</dd></div>
            </dl>
            <div className="preview-actions">
              {modelUrl ? null : (
                <button className="primary-action" disabled={threeDBusy} onClick={onRetryThreeD}>
                  {!threeDBusy ? <RotateCcw size={16} /> : null}
                  {threeDBusy ? '3D 生成中…' : threeDStatus === 'IDLE' ? '生成 3D 模型' : '重新生成 3D'}
                </button>
              )}
              {!modelUrl && !threeDBusy ? (
                <p className="retry-note">重新生成会再次发起一次按次计费的任务。</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : showDocument ? (
        <section className="document-sheet">
          <div className="document-page document-cover-page">
            <header><span>服章 · AI 汉服据典设计</span><span>定制沟通参考书</span></header>
            <div className="document-kicker">YIJING DESIGN DOSSIER</div>
            <h2>《{plan.title}》<br />汉服定制沟通参考书</h2>
            <p className="document-lead">从需求、形制、视觉图版到厂家沟通要点的完整方案。用于确认设计方向与制作意图，不代替纸样、放码和工艺单。</p>
            <div className="document-hero">
              {reportViews[0].url ? <img src={reportViews[0].url} alt={`${plan.title}正面设计效果图`} /> : <div className="document-image-missing">正面效果图尚未生成</div>}
            </div>
            <div className="document-cover-summary">
              <span>{form.dynasty || '朝代待确认'}</span>
              <span>{form.form || '形制待确认'}</span>
              <span>{form.occasion || '场景待确认'}</span>
              <span>{form.restoration || '创作边界待确认'}</span>
            </div>
            <footer><span>视觉沟通文件</span><span>生成日期：{new Date().toLocaleDateString('zh-CN')}</span></footer>
          </div>

          <div className="document-page">
            <header><span>服章 · 定制沟通参考书</span><span>01 / 方案总览</span></header>
            <h2>需求确认与设计总览</h2>
            <p className="document-section-lead">以下内容来自用户确认信息与本轮据典设计结果，空白项表示尚未确认，不由系统推测补齐。</p>
            <div className="document-requirements">
              {requirementRows.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value || '尚未确认'}</dd></div>
              ))}
            </div>
            <section className="document-block document-block-emphasis">
              <span>方案摘要</span><h3>{plan.title}</h3><p>{plan.summary}</p>
            </section>
            <div className="document-columns document-detail-columns">
              <section><span>01</span><h3>形制与廓形</h3><p>{plan.shape}</p></section>
              <section><span>02</span><h3>配色体系</h3><p>{plan.colors}</p></section>
              <section><span>03</span><h3>纹样组织</h3><p>{plan.motif}</p></section>
              <section><span>04</span><h3>面料与质感</h3><p>{plan.fabric}</p></section>
            </div>
            <footer><span>方案 01</span><span>请在打样前与厂家逐项确认</span></footer>
          </div>

          <div className="document-page document-visual-page">
            <header><span>服章 · 定制沟通参考书</span><span>02 / 三视图图版</span></header>
            <h2>服装三视图与核对重点</h2>
            <p className="document-section-lead">三视图为 AI 视觉参考，用于沟通轮廓、比例与纹样方向。不同视角可能存在细节漂移，厂家不得据此直接制版。</p>
            <div className="document-view-grid">
              {reportViews.map((view) => (
                <figure key={view.key}>
                  <div className="document-view-image">
                    {view.url ? <img src={view.url} alt={`${plan.title}${view.label}`} /> : <div className="document-image-missing">{view.label}<br />本次未生成</div>}
                  </div>
                  <figcaption><strong>{view.label}</strong><span>{view.note}</span></figcaption>
                </figure>
              ))}
            </div>
            <div className="document-check-strip">
              <strong>三视图一致性复核</strong>
              <span>厂家应重点核对：领型与襟向、袖口宽度、腰线位置、裙门与褶量、纹样位置、前后衣长及层次数量。</span>
            </div>
            <footer><span>AI 视觉参考</span><span>颜色以实物面料小样为准</span></footer>
          </div>

          <div className="document-page">
            <header><span>服章 · 定制沟通参考书</span><span>03 / 据典与创作说明</span></header>
            <h2>文化转译、史据边界与材料建议</h2>
            <section className="document-block"><span>文化线索转译</span><h3>个人信息如何进入设计</h3><p>{plan.culturalNotes}</p></section>
            <section className="document-block"><span>形制证据边界</span><h3>可据部分与现代设计部分</h3><p>{plan.historicalBoundary}</p></section>
            <section className="document-block"><span>材料方向</span><h3>面料、辅料与呈现效果</h3><p>{plan.fabric}</p></section>
            <section className="document-block"><span>纹样与色彩</span><h3>位置、尺度与工艺确认</h3><p>{plan.motif}；{plan.colors}</p></section>
            {plan.sources?.length ? (
              <section className="document-references">
                <h3>据典来源</h3>
                <ol>{plan.sources.slice(0, 8).map((source) => <li key={source.id || source.url}><strong>{source.title}</strong><span>{source.url}</span></li>)}</ol>
              </section>
            ) : <p className="document-warning">本轮未形成可列出的可靠来源；涉及历史结论的内容仍需进一步复核。</p>}
            <footer><span>史据与创作分别标明</span><span>来源链接建议另行存档</span></footer>
          </div>

          <div className="document-page">
            <header><span>服章 · 定制沟通参考书</span><span>04 / 厂家沟通清单</span></header>
            <h2>打样前沟通与验收要点</h2>
            <div className="document-production-grid">
              <section><span>01</span><h3>版型复核</h3><p>请版师依据穿着者净体尺寸、成衣松量和内搭层次重新确认衣长、袖长、通袖、胸围、腰围、裙长及腰头结构，不从效果图反推尺寸。</p></section>
              <section><span>02</span><h3>面料小样</h3><p>在下单前确认成分、克重、垂坠、光泽、透光度、色牢度和缩水率；主面料、里料、缘边及系带应同时留样并编号。</p></section>
              <section><span>03</span><h3>纹样定位</h3><p>确认纹样工艺、成品尺寸、循环单位、方向、对称关系和距边位置。刺绣或织金需先制作局部样，避免跨缝、压褶或被系带遮挡。</p></section>
              <section><span>04</span><h3>样衣试穿</h3><p>至少核对一次白坯或样衣：抬臂活动量、领口贴合、襟向、袖口垂落、腰线稳定、裙门位置、行走步幅与坐姿舒适度。</p></section>
              <section><span>05</span><h3>成衣验收</h3><p>逐项核对左右对称、纹样方向、色差、里外层次、针脚与锁边、系带牢度、熨烫平整度，以及三视图所表达的整体轮廓是否一致。</p></section>
              <section><span>06</span><h3>交付留档</h3><p>建议保留最终尺寸表、面辅料编号、色卡、纹样定位稿、样衣修改记录和洗护说明，便于返修、复刻或后续配件追加。</p></section>
            </div>
            <div className="document-source"><strong>文件定位</strong><span>本报告用于把审美方向、文化线索和视觉效果转译为可讨论的制作需求；不包含纸样、放码、裁片、缝份、工序参数或可直接投产的尺寸数据。</span></div>
            <p className="document-warning">重要提示：AI 图像可能出现结构不一致、纹样漂移与材质误判。正式制作前，须由具备相应形制经验的厂家或版师对结构、材料和工艺进行人工复核。</p>
            <footer><span>END</span><span>服章 · 让传统之美成为可穿的日常</span></footer>
          </div>
          <button className="primary-action print-button" onClick={printDocument}><Download size={16} />打印 / 导出 PDF</button>
        </section>
      ) : (
        <>
          <div className="design-grid">
            <figure className={`design-image ${imageLoaded ? 'loaded' : ''}`}>
              {imageUrl ? <img key={imageUrl} src={imageUrl} alt={`${plan.title}汉服设计效果图`} onLoad={() => setImageLoaded(true)} /> : null}
              {imageStatus !== 'ready' ? (
                <div className="generation-placeholder">
                  {imageStatus === 'generating' ? (
                    <GenerativeFieldLoader title="正在塑造衣装视觉" detail="形制、色彩与纹样正在缓慢汇合" />
                  ) : (
                    <div className="generation-message">
                      <strong>{imageStatus === 'error' ? '效果图生成未完成' : '效果图尚未生成'}</strong>
                      <p>{imageStatus === 'error' ? error : '设计方案已完成，视觉生成即将开始。'}</p>
                    </div>
                  )}
                </div>
              ) : null}
              <figcaption>AI 正面效果图 · 视觉参考，不是文物复原图</figcaption>
            </figure>
            <div className="design-spec">
              <section>
                <span className="section-index">01</span><h2>设计提要</h2>
                <p>{plan.summary}</p>
              </section>
              <section>
                <span className="section-index">02</span><h2>个人线索转译</h2>
                <ul>
                  <li><span>配色</span>{plan.colors}</li>
                  <li><span>纹样</span>{plan.motif}</li>
                  <li><span>文化线索</span>{plan.culturalNotes}</li>
                </ul>
              </section>
              <section>
                <span className="section-index">03</span><h2>形制边界</h2>
                <p>{plan.historicalBoundary}</p>
              </section>
            </div>
          </div>

          <section className="traceability">
            <div className="trace-heading"><h2>设计溯源</h2><a href="https://www.chnmuseum.cn/zl/ztcl/202102/t20210205_248954.shtml" target="_blank" rel="noreferrer">查看资料原则 <ExternalLink size={13} /></a></div>
            <div className="trace-row trace-header"><span>设计元素</span><span>采用方案</span><span>依据类型</span><span>判断</span></div>
            <div className="trace-row"><span>形制</span><span>{plan.shape}</span><span>历史参考与设计判断</span><span>须由厂家复核</span></div>
            <div className="trace-row"><span>配色</span><span>{plan.colors}</span><span>用户偏好与季节意象</span><span>现代创作</span></div>
            <div className="trace-row"><span>纹样</span><span>{plan.motif}</span><span>用户个人线索</span><span>现代创作</span></div>
          </section>

          {plan.sources?.length ? (
            <section className="traceability design-evidence">
              <div className="trace-heading"><h2>本地据典来源</h2><span>自动匹配 {plan.sources.length} 条</span></div>
              <div className="dynamic-source-grid">
                {plan.sources.slice(0, 6).map((source, index) => (
                  <a className="quote-panel dynamic-source" href={source.url} target="_blank" rel="noreferrer" key={source.id || `${source.url}-${index}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <p>{source.title}</p>
                      <small className="dynamic-source-url" title={source.url}>链接：{source.url}</small>
                      <small className={`source-tier ${source.trustLevel || 'general'}`}>{source.trustLabel || '本地资料'}</small>
                    </div>
                    <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <div className="design-actions">
            <button className="secondary-action" type="button" onClick={onEditRequirements}><RotateCcw size={16} />调整方案</button>
            <button className="primary-action" disabled={imageStatus !== 'ready'} onClick={() => onViewChange('preview')}><Box size={16} />{imageStatus === 'ready' ? '生成并查看 3D' : '等待效果图'}</button>
          </div>
        </>
      )}
    </article>
  )
}
