import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ClipboardCheck, Wrench } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import type { NavItem } from '../components/layout/AppLayout'
import { AlertIcon, CalendarIcon, FuelIcon, HomeIcon, RouteIcon, TruckIcon, UsersIcon } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import AbastecimentoPage from '../pages/AbastecimentoPage'
import AgendaPage from '../pages/AgendaPage'
import EquipePage from '../pages/EquipePage'
import ForbiddenPage from '../pages/ForbiddenPage'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/LoginPage'
import ManutencoesPage from '../pages/ManutencoesPage'
import MultasPage from '../pages/MultasPage'
import NotFoundPage from '../pages/NotFoundPage'
import ServerErrorPage from '../pages/ServerErrorPage'
import SobreNosPage from '../pages/SobreNosPage'
import SolicitacoesPage from '../pages/SolicitacoesPage'
import VeiculosPage from '../pages/VeiculosPage'
import ViagensPage from '../pages/ViagensPage'
import { LABELS_PERFIS } from '../types/usuario'
import type { Perfil } from '../types/usuario'
import { RotaProtegida, RotaPublica } from './guards'

type NavItemComPerfil = NavItem & { perfis?: Perfil[] }

/** `perfis` ausente = qualquer usuário logado pode ver. */
export const navItems: NavItemComPerfil[] = [
  // VISÃO GERAL
  { path: '/inicio', label: 'Início', icon: HomeIcon, section: 'Visão Geral' },

  // OPERAÇÃO
  { path: '/solicitacoes', label: 'Solicitações', icon: ClipboardCheck, section: 'Operação' },
  { path: '/viagens', label: 'Viagens', icon: RouteIcon, section: 'Operação' },
  { path: '/agenda', label: 'Agenda', icon: CalendarIcon, section: 'Operação' },

  // FROTA
  { path: '/veiculos', label: 'Veículos', icon: TruckIcon, section: 'Frota' },
  { path: '/abastecimento', label: 'Abastecimento', icon: FuelIcon, section: 'Frota' },
  { path: '/manutencoes', label: 'Manutenções', icon: Wrench, section: 'Frota' },
  { path: '/multas', label: 'Infrações', icon: AlertIcon, section: 'Frota' },

  // ADMINISTRAÇÃO
  { path: '/equipe', label: 'Equipe', icon: UsersIcon, section: 'Administração' },
]

function LayoutRoute() {
  const { pathname } = useLocation()
  const { usuario, logout, temPerfil } = useAuth()

  const itensVisiveis = navItems.filter((item) => !item.perfis || temPerfil(...item.perfis))
  const title = pathname.startsWith('/sobre')
    ? 'Sobre Nós'
    : itensVisiveis.find((item) => pathname.startsWith(item.path))?.label ?? 'FSPH'

  return (
    <AppLayout
      navItems={itensVisiveis}
      title={title}
      user={usuario ? { name: usuario.nome, role: LABELS_PERFIS[usuario.perfil] } : undefined}
      onLogout={logout}
    >
      <Outlet />
    </AppLayout>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RotaPublica />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Rotas de demonstração direta das páginas de erro */}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/500" element={<ServerErrorPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<RotaProtegida />}>
        <Route element={<LayoutRoute />}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<HomePage />} />
          <Route path="/dashboard" element={<Navigate to="/inicio" replace />} />
          <Route path="/solicitacoes" element={<SolicitacoesPage />} />
          <Route path="/viagens" element={<ViagensPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/veiculos" element={<VeiculosPage />} />
          <Route path="/manutencoes" element={<ManutencoesPage />} />
          <Route path="/abastecimento" element={<AbastecimentoPage />} />
          <Route path="/multas" element={<MultasPage />} />
          <Route path="/equipe" element={<EquipePage />} />
          <Route path="/sobre" element={<SobreNosPage />} />

          {/* Redirecionamentos de rotas legadas para a nova arquitetura */}
          <Route path="/motoristas" element={<Navigate to="/equipe?aba=motoristas" replace />} />
          <Route path="/usuarios" element={<Navigate to="/equipe?aba=usuarios" replace />} />
        </Route>
      </Route>

      {/* Catch-all global para páginas inexistentes fora do layout */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
