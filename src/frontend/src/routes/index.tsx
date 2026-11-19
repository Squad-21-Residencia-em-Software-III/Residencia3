import type { ReactElement } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardCheck, ScrollText, Wrench } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import type { NavItem } from '../components/layout/AppLayout'
import { SOBRE_NOS_PATH, SobreNosLink } from '../components/layout/SobreNosLink'
import { AlertIcon, CalendarIcon, FuelIcon, HomeIcon, RouteIcon, TruckIcon, UsersIcon } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import AbastecimentoPage from '../pages/AbastecimentoPage'
import AgendaPage from '../pages/AgendaPage'
import AuditoriaPage from '../pages/AuditoriaPage'
import EquipePage from '../pages/EquipePage'
import MinhasColetasSvoPage from '../pages/MinhasColetasSvoPage'
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
import { usePermissao } from '../utils/permissoes'
import type { Permissao } from '../utils/permissoes'
import { RotaComPermissao, RotaProtegida, RotaPublica } from './guards'

type NavItemComPermissao = NavItem & { permissao?: Permissao }

/** `permissao` ausente = qualquer usuário logado pode ver (ver utils/permissoes). */
export const navItems: NavItemComPermissao[] = [
  // VISÃO GERAL
  { path: '/inicio', label: 'Início', icon: HomeIcon, section: 'Visão Geral' },

  // OPERAÇÃO
  {
    path: '/solicitacoes',
    label: 'Solicitações',
    icon: ClipboardCheck,
    section: 'Operação',
    permissao: 'solicitacoes.acessar',
  },
  { path: '/viagens', label: 'Viagens', icon: RouteIcon, section: 'Operação', permissao: 'viagens.acessar' },
  { path: '/minhas-coletas', label: 'Minhas coletas', icon: RouteIcon, section: 'Operação', permissao: 'coletasProprias.acessar' },
  { path: '/agenda', label: 'Agenda', icon: CalendarIcon, section: 'Operação', permissao: 'agenda.acessar' },

  // FROTA
  { path: '/veiculos', label: 'Veículos', icon: TruckIcon, section: 'Frota', permissao: 'veiculos.acessar' },
  {
    path: '/abastecimento',
    label: 'Abastecimento',
    icon: FuelIcon,
    section: 'Frota',
    permissao: 'abastecimentos.acessar',
  },
  { path: '/manutencoes', label: 'Manutenções', icon: Wrench, section: 'Frota', permissao: 'manutencoes.acessar' },
  { path: '/multas', label: 'Infrações', icon: AlertIcon, section: 'Frota', permissao: 'multas.acessar' },

  // ADMINISTRAÇÃO
  { path: '/equipe', label: 'Equipe', icon: UsersIcon, section: 'Administração', permissao: 'equipe.acessar' },
  {
    path: '/auditoria',
    label: 'Auditoria',
    icon: ScrollText,
    section: 'Administração',
    permissao: 'auditoria.acessar',
  },
]

function LayoutRoute() {
  const { pathname } = useLocation()
  const sobreNos = useMatch(SOBRE_NOS_PATH)
  const { usuario, logout } = useAuth()
  const { pode } = usePermissao()

  if (!usuario) return <Outlet />

  const itensVisiveis = navItems.filter((item) => !item.permissao || pode(item.permissao))
  const title = sobreNos
    ? 'Sobre Nós'
    : itensVisiveis.find((item) => pathname.startsWith(item.path))?.label ?? 'FSPH'

  return (
    <AppLayout
      navItems={itensVisiveis}
      title={title}
      user={{ name: usuario.nome, role: LABELS_PERFIS[usuario.perfil] }}
      onLogout={logout}
    >
      <Outlet />
    </AppLayout>
  )
}

function SobreNosRoute() {
  const { usuario } = useAuth()
  const { state } = useLocation()
  const navigate = useNavigate()
  const veioDeOutraTela = (state as { veioDeOutraTela?: boolean } | null)?.veioDeOutraTela

  if (usuario) return <SobreNosPage />

  return (
    <div className="flex min-h-full flex-col bg-page-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3.5 md:h-[60px] md:px-8">
        {veioDeOutraTela ? (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar
          </button>
        ) : (
          <Link to="/login" className="text-sm font-semibold text-primary hover:underline">
            Entrar
          </Link>
        )}
        <SobreNosLink />
      </header>
      <main className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6 md:py-6">
        <SobreNosPage />
      </main>
    </div>
  )
}

const ROTAS_COM_PERMISSAO: { path: string; permissao: Permissao; elemento: ReactElement }[] = [
  { path: '/solicitacoes', permissao: 'solicitacoes.acessar', elemento: <SolicitacoesPage /> },
  { path: '/triagem-svo', permissao: 'triagemSvo.acessar', elemento: <Navigate to="/solicitacoes?aba=svo" replace /> },
  { path: '/viagens', permissao: 'viagens.acessar', elemento: <ViagensPage /> },
  { path: '/minhas-coletas', permissao: 'coletasProprias.acessar', elemento: <MinhasColetasSvoPage /> },
  { path: '/agenda', permissao: 'agenda.acessar', elemento: <AgendaPage /> },
  { path: '/abastecimento', permissao: 'abastecimentos.acessar', elemento: <AbastecimentoPage /> },
  { path: '/manutencoes', permissao: 'manutencoes.acessar', elemento: <ManutencoesPage /> },
  { path: '/multas', permissao: 'multas.acessar', elemento: <MultasPage /> },
  { path: '/equipe', permissao: 'equipe.acessar', elemento: <EquipePage /> },
  { path: '/auditoria', permissao: 'auditoria.acessar', elemento: <AuditoriaPage /> },
]

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

      <Route element={<LayoutRoute />}>
        <Route path={SOBRE_NOS_PATH} element={<SobreNosRoute />} />
        <Route element={<RotaProtegida />}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<HomePage />} />
          <Route path="/dashboard" element={<Navigate to="/inicio" replace />} />
          <Route element={<RotaComPermissao permissao="veiculos.acessar" />}>
            <Route path="/veiculos" element={<VeiculosPage />} />
          </Route>

          {/* Cada tela exige a permissão do seu perfil (utils/permissoes); o backend também bloqueia com 403 */}
          {ROTAS_COM_PERMISSAO.map(({ path, permissao, elemento }) => (
            <Route key={path} element={<RotaComPermissao permissao={permissao} />}>
              <Route path={path} element={elemento} />
            </Route>
          ))}

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
