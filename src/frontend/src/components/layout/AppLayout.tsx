import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cva } from 'class-variance-authority';
import {
  BellIcon,
  ChevronLeftIcon,
  CloseIcon,
  LogoutIcon,
  MenuIcon,
  PlusIcon,
} from '../ui';
import { cn } from '../../utils/cn';

export type NavItem = {
  path: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  section?: string;
  badge?: number | string;
  badgeTone?: 'warning' | 'danger' | 'info' | 'neutral';
};

type AppLayoutProps = {
  navItems: NavItem[];
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  user?: { name: string; role: string };
  onLogout?: () => void;
  children: ReactNode;
};

const sidebarBadgeVariants = cva(
  'ml-1.5 rounded-full px-1.5 py-0.5 text-xs leading-tight font-bold',
  {
    variants: {
      tone: {
        warning: 'border border-amber-500/40 bg-amber-500/20 text-amber-300',
        danger: 'border border-red-500/40 bg-red-500/20 text-red-300',
        info: 'border border-blue-500/40 bg-blue-500/20 text-blue-300',
        neutral: 'bg-white/10 text-slate-200',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  }
);

function initialsOf(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isHomePage = location.pathname === '/' || location.pathname === '/inicio';
  const isCompact = collapsed && !mobileOpen;

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  const handleLogout = () => {
    setMobileOpen(false);
    onLogout?.();
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-page-bg">
      {/* Backdrop para fechar o menu ao clicar fora no mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-95 bg-navy-900/55 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-100 flex h-full w-[270px] max-w-[82vw] shrink-0 flex-col border-r border-white/6 bg-sidebar shadow-2xl transition-all duration-250 ease-out md:relative md:z-auto md:max-w-none md:translate-x-0 md:shadow-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'md:w-[68px]' : 'md:w-[236px]'
        )}
      >
        {/* Área da Logo: 72.5px fixos para que a borda inferior fique cravada em y=72px (meio do círculo toggle) */}
        <div className="flex h-[72.5px] min-h-[72.5px] shrink-0 items-center justify-center overflow-hidden border-b border-white/8 px-3">
          <img
            src={isCompact ? '/assets/icon.png' : '/assets/logo.png'}
            alt="FSPH — Fundação de Saúde Parreiras Horta"
            className={cn(
              'object-contain',
              isCompact ? 'h-9 w-9' : 'h-12 min-w-0 flex-1'
            )}
          />
          {/* Botão de fechar visível apenas no mobile */}
          <button
            type="button"
            className="ml-2 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/8 text-white transition-colors hover:bg-white/16 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Botão Circular de Recolher: topo colado na base da Topbar (60px) e centro em 72px */}
        <button
          type="button"
          className="absolute top-[60px] -right-3 z-10 hidden h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-white p-0 leading-none text-text shadow-md md:flex"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!collapsed}
        >
          <span
            className={cn(
              'block shrink-0 transition-transform duration-300',
              collapsed && 'rotate-180'
            )}
          >
            <ChevronLeftIcon size={12} />
          </span>
        </button>

        <nav
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-2.5 pt-2.5',
            isCompact && 'md:pt-4'
          )}
          aria-label="Navegação principal"
        >
          {navItems.reduce<ReactNode[]>((acc, item, index) => {
            const prevSection = index > 0 ? navItems[index - 1].section : null;
            const isNewSection = item.section && item.section !== prevSection;

            if (isNewSection && !isCompact) {
              acc.push(
                <div
                  key={`section-${item.section}`}
                  className="px-3.5 pt-4 pb-1.5 font-display text-xs font-bold tracking-wider text-slate-400/55 uppercase"
                >
                  {item.section}
                </div>
              );
            } else if (isNewSection && isCompact) {
              acc.push(
                <div
                  key={`section-divider-${item.section}`}
                  className="mx-3 my-2.5 h-px bg-white/6"
                />
              );
            }

            const { path, label, icon: Icon, badge, badgeTone } = item;

            acc.push(
              <NavLink
                key={path}
                to={path}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  cn(
                    'group relative flex w-full items-center gap-3 overflow-hidden rounded-md border px-3 py-2 text-left text-sm font-semibold tracking-tight whitespace-nowrap no-underline transition-all duration-150',
                    isActive
                      ? 'border-white/90 bg-white font-bold text-navy-900 shadow-md hover:bg-white hover:text-navy-900'
                      : 'border-transparent bg-transparent text-slate-400 hover:bg-white/6 hover:text-white',
                    isCompact && 'md:justify-center md:gap-0 md:px-0'
                  )
                }
                title={isCompact ? label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={cn(
                        'flex shrink-0 items-center justify-center',
                        isActive ? 'text-primary' : 'text-current'
                      )}
                    >
                      <Icon size={18} />
                    </div>
                    {!isCompact && (
                      <div className="flex min-w-0 flex-1 items-center justify-between">
                        <span
                          className={cn(
                            'truncate',
                            isActive && 'text-navy-900'
                          )}
                        >
                          {label}
                        </span>
                        {badge !== undefined && (
                          <span
                            className={sidebarBadgeVariants({
                              tone: badgeTone ?? 'neutral',
                            })}
                          >
                            {badge}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );

            return acc;
          }, [])}
        </nav>

        <div className="mt-auto border-t border-white/6 px-2.5 pt-3 pb-4">
          {user && (
            <div
              className={cn(
                'mb-1 flex items-center gap-3 rounded-md border border-white/4 bg-white/4 px-2.5 py-2',
                isCompact && 'md:justify-center md:gap-0 md:px-0'
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-primary to-blue-700 font-display text-xs font-bold text-white">
                {initialsOf(user.name)}
              </span>
              {!isCompact && (
                <div className="flex min-w-0 flex-col">
                  <strong className="truncate font-display text-xs font-semibold text-slate-100">
                    {user.name}
                  </strong>
                  <span className="truncate text-xs text-slate-400/70">
                    {user.role}
                  </span>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-md bg-transparent px-2.5 py-2 text-xs font-semibold whitespace-nowrap text-white/35 transition-colors hover:text-white/70',
              isCompact && 'md:justify-center md:gap-0 md:px-0'
            )}
            onClick={handleLogout}
            title={isCompact ? 'Sair da conta' : undefined}
          >
            <LogoutIcon size={18} />
            {!isCompact && <span>Sair da conta</span>}
          </button>
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-3.5 shadow-2xs md:h-[60px] md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* Botão de Menu Hambúrguer Clássico (3 barras) no mobile */}
            <button
              type="button"
              className="-ml-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border bg-surface p-0 text-text transition-all hover:border-border-strong hover:bg-surface-hover active:scale-95 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu de navegação"
              title="Abrir menu"
            >
              <MenuIcon size={20} />
            </button>

            <h1 className="m-0 truncate font-display text-sm font-bold text-text md:text-base">
              {title}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {actionLabel && (
              <button
                type="button"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
                onClick={onAction}
              >
                <PlusIcon />
                <span className="hidden md:inline">{actionLabel}</span>
              </button>
            )}
            {isHomePage && (
              <NavLink
                to="/sobre"
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-7.5 cursor-pointer items-center justify-center rounded-md border border-primary bg-primary px-2.5 text-xs font-semibold whitespace-nowrap text-white no-underline transition-all hover:border-primary-hover hover:bg-primary-hover hover:shadow-sm md:h-8.5 md:px-3.5',
                    isActive && 'bg-primary-hover shadow-inner'
                  )
                }
              >
                Sobre Nós
              </NavLink>
            )}
            <button
              type="button"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-all hover:border-border-strong hover:bg-surface-hover"
              aria-label="Notificações"
            >
              <BellIcon />
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
