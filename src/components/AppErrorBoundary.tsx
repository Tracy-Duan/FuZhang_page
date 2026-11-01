import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('服章页面渲染失败', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="fatal-error" role="alert">
        <span>服章</span>
        <h1>这一页没有正确展开</h1>
        <p>模型返回的数据格式出现异常。问题已被拦截，你可以重新加载后继续。</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      </main>
    )
  }
}
