import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import type { NavItem } from '../components/layout/AppLayout'
import { CalendarIcon, FuelIcon, GridIcon, RouteIcon, TruckIcon, UsersIcon } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import AbastecimentoPage from '../pages/AbastecimentoPage'
import AgendaPage from '../pages/AgendaPage'
import DashboardPage from '../pages/DashboardPage'
import LoginPage from '../pages/LoginPage'
import MotoristasPage from '../pages/MotoristasPage'
import NotFoundPage from '../pages/NotFoundPage'
import UsuariosPage from '../pages/UsuariosPage'
import VeiculosPage from '../pages/VeiculosPage'
import ViagensPage from '../pages/ViagensPage'
import { LABELS_PERFIS, PERFIS } from '../types/usuario'
import type { Perfil } from '../types/usuario'
import { RotaPorPerfil, RotaProtegida, RotaPublica } from './guards'

type NavItemComPerfil = NavItem & { perfis?: Perfil[] }

/** `perfis` ausente = qualquer usuário logado pode ver. */
export const navItems: NavItemComPerfil[] = [
  { path: '/dashboard', label: 'Dashboard', icon: GridIcon },
  { path: '/agenda', label: 'Agenda', icon: CalendarIcon },
  { path: '/veiculos', label: 'Veículos', icon: TruckIcon },
  { path: '/abastecimento', label: 'Abastecimento', icon: FuelIcon },
  { path: '/motoristas', label: 'Motoristas', icon: UsersIcon },
  { path: '/viagens', label: 'Viagens', icon: RouteIcon },
  { path: '/usuarios', label: 'Usuários', icon: UsersIcon, perfis: [PERFIS.ADMINISTRADOR] },
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

      <Route element={<RotaProtegida />}>
        <Route element={<LayoutRoute />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/veiculos" element={<VeiculosPage />} />
          <Route path="/abastecimento" element={<AbastecimentoPage />} />
          <Route path="/motoristas" element={<MotoristasPage />} />
          <Route path="/viagens" element={<ViagensPage />} />

          {/* Só administrador (o backend também bloqueia com 403) */}
          <Route element={<RotaPorPerfil perfis={[PERFIS.ADMINISTRADOR]} />}>
            <Route path="/usuarios" element={<UsuariosPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
