import type { ReactNode } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
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
        <SessaoPorRota>
          <NotificacoesProvider>
            <BannerOffline />
            <AppRoutes />
            <BridgeNotificacoesSw />
            <ToastNotificacao />
            <PromptAtualizacaoPwa />
          </NotificacoesProvider>
        </SessaoPorRota>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

function SessaoPorRota({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <AuthProvider pathname={pathname}>{children}</AuthProvider>
}
