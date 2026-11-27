import { BrowserRouter } from 'react-router-dom'
import { AcessibilidadeProvider } from './contexts/AcessibilidadeContext'
import { AuthProvider } from './contexts/AuthContext'
import { NotificacoesProvider } from './contexts/NotificacoesContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BridgeNotificacoesSw } from './components/notificacoes/BridgeNotificacoesSw'
import { ToastNotificacao } from './components/notificacoes/ToastNotificacao'
import { BannerOffline } from './components/pwa/BannerOffline'
import { PromptAtualizacaoPwa } from './components/pwa/PromptAtualizacaoPwa'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <AcessibilidadeProvider>
            <NotificacoesProvider>
              <BannerOffline />
              <AppRoutes />
              <BridgeNotificacoesSw />
              <ToastNotificacao />
              <PromptAtualizacaoPwa />
            </NotificacoesProvider>
          </AcessibilidadeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
