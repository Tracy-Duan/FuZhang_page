import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { BookSpiritProvider } from './components/bookSpiritStore'
import { BookSpiritUI } from './components/BookSpiritUI'
import { AuthProvider, AuthModal } from './components/auth'
import { LoginBoundary } from './components/auth/LoginBoundary'
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/500.css'
import '@fontsource/noto-serif-sc/700.css'
import './styles.css'
import './frontend-update.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <BookSpiritProvider>
          <LoginBoundary>
            <App />
            <BookSpiritUI />
          </LoginBoundary>
          <AuthModal />
        </BookSpiritProvider>
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
