import { useState } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import type { NavItem } from './components/layout/AppLayout'
import { Card, CalendarIcon, GridIcon, RouteIcon, TruckIcon, UsersIcon } from './components/ui'

// Provisório: a navegação por estado local será trocada pelas rotas na próxima etapa.

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: GridIcon },
  { id: 'agenda', label: 'Agenda', icon: CalendarIcon },
  { id: 'veiculos', label: 'Veículos', icon: TruckIcon },
  { id: 'motoristas', label: 'Motoristas', icon: UsersIcon },
  { id: 'viagens', label: 'Viagens', icon: RouteIcon },
  { id: 'usuarios', label: 'Usuários', icon: UsersIcon },
]

export default function App() {
  const [active, setActive] = useState('dashboard')
  const current = navItems.find((item) => item.id === active)!

  return (
    <AppLayout
      navItems={navItems}
      activeId={active}
      onNavigate={setActive}
      title={current.label}
      actionLabel="Nova solicitação"
      user={{ name: 'Usuário Teste', role: 'Administrador' }}
    >
      <Card style={{ padding: 24 }}>
        <h2>{current.label}</h2>
        <p>Conteúdo da página aparecerá aqui.</p>
      </Card>
    </AppLayout>
  )
}
