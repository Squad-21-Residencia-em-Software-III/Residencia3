import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BellIcon, ChevronLeftIcon, CloseIcon, LogoutIcon, MenuIcon, PlusIcon } from '../ui'
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
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleNavClick = () => {
    setMobileOpen(false)
  }

  const handleLogout = () => {
    setMobileOpen(false)
    onLogout?.()
  }

  return (
    <div className="app-layout">
      {/* Backdrop para fechar o menu ao clicar fora no mobile */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${
          mobileOpen ? 'sidebar--mobile-open' : ''
        }`.trim()}
      >
        <div className="sidebar__brand">
          <img
            src={collapsed ? '/assets/icon.png' : '/assets/logo.png'}
            alt="FSPH — Fundação de Saúde Parreiras Horta"
            className={collapsed ? 'sidebar__icon' : 'sidebar__logo'}
          />
          {/* Botão de fechar visível apenas no mobile */}
          <button
            className="sidebar__mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <CloseIcon size={18} />
          </button>
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
              onClick={handleNavClick}
              className={({ isActive }) =>
                `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`.trim()
              }
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
          <button
            className="sidebar__logout"
            onClick={handleLogout}
            title={collapsed ? 'Sair da conta' : undefined}
          >
            <LogoutIcon size={18} />
            {!collapsed && <span>Sair da conta</span>}
          </button>
        </div>
      </aside>

      <div className="app-layout__main">
        <header className="topbar">
          <div className="topbar__left">
            {/* Botão de Menu Hambúrguer Clássico (3 barras) no mobile */}
            <button
              className="topbar__menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu de navegação"
              title="Abrir menu"
            >
              <MenuIcon size={20} />
            </button>

            <h1 className="topbar__title">{title}</h1>
          </div>

          <div className="topbar__actions">
            {actionLabel && (
              <button className="btn btn--primary btn--topbar-action" onClick={onAction}>
                <PlusIcon /> <span className="btn__label-text">{actionLabel}</span>
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
