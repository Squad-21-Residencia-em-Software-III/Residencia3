import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { LayoutDashboard, UserRoundCog } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import type { NavItem } from '../components/layout/AppLayout'
import { AlertIcon, CalendarIcon, FuelIcon, HomeIcon, RouteIcon, TruckIcon, UsersIcon } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import AbastecimentoPage from '../pages/AbastecimentoPage'
import AgendaPage from '../pages/AgendaPage'
import DashboardPage from '../pages/DashboardPage'
import ForbiddenPage from '../pages/ForbiddenPage'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/LoginPage'
import MotoristasPage from '../pages/MotoristasPage'
import MultasPage from '../pages/MultasPage'
import NotFoundPage from '../pages/NotFoundPage'
import ServerErrorPage from '../pages/ServerErrorPage'
import UsuariosPage from '../pages/UsuariosPage'
import VeiculosPage from '../pages/VeiculosPage'
import ViagensPage from '../pages/ViagensPage'
import { LABELS_PERFIS, PERFIS } from '../types/usuario'
import type { Perfil } from '../types/usuario'
import { RotaPorPerfil, RotaProtegida, RotaPublica } from './guards'

type NavItemComPerfil = NavItem & { perfis?: Perfil[] }

/** `perfis` ausente = qualquer usuário logado pode ver. */
export const navItems: NavItemComPerfil[] = [
  // Visão Geral (Topo / F-Pattern)
  { path: '/inicio', label: 'Início', icon: HomeIcon, section: 'Visão Geral' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Visão Geral' },

  // Operação
  { path: '/viagens', label: 'Viagens', icon: RouteIcon, section: 'Operação' },
  { path: '/agenda', label: 'Agenda', icon: CalendarIcon, section: 'Operação' },

  // Frota
  { path: '/veiculos', label: 'Veículos', icon: TruckIcon, section: 'Frota' },
  { path: '/abastecimento', label: 'Abastecimento', icon: FuelIcon, section: 'Frota' },
  { path: '/multas', label: 'Multas', icon: AlertIcon, section: 'Frota' },

  // Pessoas
  { path: '/motoristas', label: 'Motoristas', icon: UsersIcon, section: 'Pessoas' },
  { path: '/usuarios', label: 'Usuários', icon: UserRoundCog, section: 'Pessoas', perfis: [PERFIS.ADMINISTRADOR] },
]

function LayoutRoute() {
  const { pathname } = useLocation()
  const { usuario, logout, temPerfil } = useAuth()

  const itensVisiveis = navItems.filter((item) => !item.perfis || temPerfil(...item.perfis))
  const title = itensVisiveis.find((item) => pathname.startsWith(item.path))?.label ?? 'FSPH'

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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/veiculos" element={<VeiculosPage />} />
          <Route path="/abastecimento" element={<AbastecimentoPage />} />
          <Route path="/motoristas" element={<MotoristasPage />} />
          <Route path="/multas" element={<MultasPage />} />
          <Route path="/viagens" element={<ViagensPage />} />

          {/* Só administrador (o backend também bloqueia com 403) */}
          <Route element={<RotaPorPerfil perfis={[PERFIS.ADMINISTRADOR]} />}>
            <Route path="/usuarios" element={<UsuariosPage />} />
          </Route>
        </Route>
      </Route>

      {/* Catch-all global para páginas inexistentes fora do layout */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
