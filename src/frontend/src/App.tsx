import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BannerOffline } from './components/pwa/BannerOffline'
import { PromptAtualizacaoPwa } from './components/pwa/PromptAtualizacaoPwa'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <BannerOffline />
          <AppRoutes />
          <PromptAtualizacaoPwa />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
