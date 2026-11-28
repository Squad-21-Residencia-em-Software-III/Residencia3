import type { ReactNode } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { AcessibilidadeProvider } from './contexts/AcessibilidadeContext'
import { AuthProvider } from './contexts/AuthContext'
import { NotificacoesProvider } from './contexts/NotificacoesContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BridgeNotificacoesSw } from './components/notificacoes/BridgeNotificacoesSw'
import { ToastNotificacao } from './components/notificacoes/ToastNotificacao'
import { BannerOffline } from './components/pwa/BannerOffline'
import { PromptAtualizacaoPwa } from './components/pwa/PromptAtualizacaoPwa'
import { BotaoAcessibilidade } from './components/acessibilidade/BotaoAcessibilidade'
import { SaltoConteudo } from './components/acessibilidade/SaltoConteudo'
import { AcoesPublicasContext } from './components/layout/AcoesPublicasContext'
import { AppRoutes } from './routes'

const acoesPublicas = {
  saltoConteudo: <SaltoConteudo />,
  preferencias: <BotaoAcessibilidade superficie="clara" />,
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <SessaoPorRota>
          <NotificacoesProvider>
            <BannerOffline />
            <AcessibilidadeProvider>
              <AcoesPublicasContext.Provider value={acoesPublicas}>
                <AppRoutes />
              </AcoesPublicasContext.Provider>
            </AcessibilidadeProvider>
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
