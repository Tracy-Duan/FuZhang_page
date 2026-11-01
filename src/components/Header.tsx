import { BrandLogo } from './BrandLogo'

interface HeaderProps {
  onOpenHistory: () => void
}

export function Header({ onOpenHistory }: HeaderProps) {
  return (
    <header className="app-header">
      <button className="brand" onClick={onOpenHistory} aria-label="打开历史对话">
        <BrandLogo />
        <span className="brand-line" />
        <span className="brand-subtitle">让传统之美，成为可穿的日常</span>
      </button>

    </header>
  )
}
