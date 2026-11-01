import type { ReactNode, SyntheticEvent } from 'react'
import { useAuth } from './authStore'

// One UI boundary also covers portals owned by the app, including book controls.
// API authorization remains mandatory; this boundary is only the guest UX.
export function LoginBoundary({ children }: { children: ReactNode }) {
  const { isAuthenticated, isCheckingSession, openAuthModal } = useAuth()
  function guard(event: SyntheticEvent) {
    if (isAuthenticated || !(event.target instanceof Element)) return
    if (event.target.closest('[data-auth-entry], .fz-auth-shell')) return
    if (!event.target.closest('button, a, input, textarea, select, form, [role="button"], [draggable="true"], [tabindex]')) return
    event.preventDefault()
    event.stopPropagation()
    if (!isCheckingSession) openAuthModal('login')
  }
  return <div style={{ display: 'contents' }} onPointerDownCapture={guard} onClickCapture={guard}
    onDoubleClickCapture={guard} onContextMenuCapture={guard} onBeforeInputCapture={guard}
    onPasteCapture={guard} onDropCapture={guard} onDragStartCapture={guard} onSubmitCapture={guard}
    onKeyDownCapture={event => { if (!['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) guard(event) }}>
    {children}
  </div>
}
