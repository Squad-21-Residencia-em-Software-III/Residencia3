import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { NotificacoesProvider } from './contexts/NotificacoesContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastNotificacao } from './components/notificacoes/ToastNotificacao'
import { BannerOffline } from './components/pwa/BannerOffline'
import { PromptAtualizacaoPwa } from './components/pwa/PromptAtualizacaoPwa'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificacoesProvider>
            <BannerOffline />
            <AppRoutes />
            <ToastNotificacao />
            <PromptAtualizacaoPwa />
          </NotificacoesProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
