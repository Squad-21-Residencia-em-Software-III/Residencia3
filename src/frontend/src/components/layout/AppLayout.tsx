import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BellIcon, ChevronLeftIcon, LogoutIcon, PlusIcon } from '../ui'
import './layout.css'

export type NavItem = {
  path: string
  label: string
  icon: ComponentType<{ size?: number }>
}

type AppLayoutProps = {
  navItems: NavItem[]
  title: string
  actionLabel?: string
  onAction?: () => void
  user?: { name: string; role: string }
  onLogout?: () => void
  children: ReactNode
}

function initialsOf(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function AppLayout({
  navItems,
  title,
  actionLabel,
  onAction,
  user,
  onLogout,
  children,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="app-layout">
      <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`.trim()}>
        <div className="sidebar__brand">
          <img
            src={collapsed ? '/assets/icon.png' : '/assets/logo.png'}
            alt="FSPH — Fundação de Saúde Parreiras Horta"
            className={collapsed ? 'sidebar__icon' : 'sidebar__logo'}
          />
        </div>

        <button
          className="sidebar__toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!collapsed}
        >
          <ChevronLeftIcon size={12} />
        </button>

        {!collapsed && <span className="sidebar__section">Menu</span>}

        <nav className="sidebar__nav" aria-label="Navegação principal">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`.trim()}
              title={collapsed ? label : undefined}
            >
              <Icon size={20} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          {user && (
            <div className="sidebar__user">
              <span className="sidebar__user-avatar">{initialsOf(user.name)}</span>
              {!collapsed && (
                <div className="sidebar__user-info">
                  <strong>{user.name}</strong>
                  <span>{user.role}</span>
                </div>
              )}
            </div>
          )}
          <button className="sidebar__logout" onClick={onLogout} title={collapsed ? 'Sair da conta' : undefined}>
            <LogoutIcon size={18} />
            {!collapsed && <span>Sair da conta</span>}
          </button>
        </div>
      </aside>

      <div className="app-layout__main">
        <header className="topbar">
          <h1 className="topbar__title">{title}</h1>
          <div className="topbar__actions">
            {actionLabel && (
              <button className="btn btn--primary" onClick={onAction}>
                <PlusIcon /> {actionLabel}
              </button>
            )}
            <button className="topbar__bell" aria-label="Notificações">
              <BellIcon />
            </button>
          </div>
        </header>
        <main className="app-layout__content">{children}</main>
      </div>
    </div>
  )
}
