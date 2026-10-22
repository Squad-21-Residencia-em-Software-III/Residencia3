import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import type { NavItem } from '../components/layout/AppLayout'
import { CalendarIcon, GridIcon, RouteIcon, TruckIcon, UsersIcon } from '../components/ui'
import AgendaPage from '../pages/AgendaPage'
import DashboardPage from '../pages/DashboardPage'
import MotoristasPage from '../pages/MotoristasPage'
import NotFoundPage from '../pages/NotFoundPage'
import UsuariosPage from '../pages/UsuariosPage'
import VeiculosPage from '../pages/VeiculosPage'
import ViagensPage from '../pages/ViagensPage'

export const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: GridIcon },
  { path: '/agenda', label: 'Agenda', icon: CalendarIcon },
  { path: '/veiculos', label: 'Veículos', icon: TruckIcon },
  { path: '/motoristas', label: 'Motoristas', icon: UsersIcon },
  { path: '/viagens', label: 'Viagens', icon: RouteIcon },
  { path: '/usuarios', label: 'Usuários', icon: UsersIcon },
]

function LayoutRoute() {
  const { pathname } = useLocation()
  const title = navItems.find((item) => pathname.startsWith(item.path))?.label ?? 'FSPH'

  return (
    <AppLayout
      navItems={navItems}
      title={title}
      user={{ name: 'Usuário Teste', role: 'Administrador' }}
    >
      <Outlet />
    </AppLayout>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<LayoutRoute />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/veiculos" element={<VeiculosPage />} />
        <Route path="/motoristas" element={<MotoristasPage />} />
        <Route path="/viagens" element={<ViagensPage />} />
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
