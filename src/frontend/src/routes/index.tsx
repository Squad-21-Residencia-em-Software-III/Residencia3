import type { ReactElement } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ClipboardCheck, ScrollText, Wrench } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import type { NavItem } from '../components/layout/AppLayout'
import { MotoristaLayout } from '../components/layout/MotoristaLayout'
import { PublicLayout } from '../components/layout/PublicLayout'
import { AlertIcon, CalendarIcon, FuelIcon, HomeIcon, RouteIcon, TruckIcon, UsersIcon } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useMotoristaMobile } from '../hooks/useMotoristaMobile'
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
import MotoristaAbastecimento from '../pages/motorista/MotoristaAbastecimento'
import MotoristaInicio from '../pages/motorista/MotoristaInicio'
import MotoristaVeiculo from '../pages/motorista/MotoristaVeiculo'
import MotoristaViagens from '../pages/motorista/MotoristaViagens'
import NotFoundPage from '../pages/NotFoundPage'
import ServerErrorPage from '../pages/ServerErrorPage'
import SobreNosPage from '../pages/SobreNosPage'
import SolicitacoesPage from '../pages/SolicitacoesPage'
import VeiculosPage from '../pages/VeiculosPage'
import ViagensPage from '../pages/ViagensPage'
import AcompanharSolicitacaoPage from '../pages/publico/AcompanharSolicitacaoPage'
import { LABELS_PERFIS } from '../types/usuario'
import { usePermissao } from '../utils/permissoes'
import type { Permissao } from '../utils/permissoes'
import { RotaComPermissao, RotaComRecurso, RotaProtegida, RotaPublica } from './guards'

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
  const { usuario, logout } = useAuth()
  const { pode } = usePermissao()
  const motoristaMobile = useMotoristaMobile()

  const itensVisiveis = navItems.filter((item) => !item.permissao || pode(item.permissao))
  const title = pathname.startsWith('/sobre')
    ? 'Sobre Nós'
    : itensVisiveis.find((item) => pathname.startsWith(item.path))?.label ?? 'FSPH'

  if (motoristaMobile) {
    return (
      <MotoristaLayout
        navItems={itensVisiveis}
        title={title}
        user={usuario ? { name: usuario.nome, role: LABELS_PERFIS[usuario.perfil] } : undefined}
        onLogout={logout}
      >
        <Outlet />
      </MotoristaLayout>
    )
  }

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

/** Motorista no celular usa a tela própria; computador e demais perfis seguem com a padrão. */
function TelaPorDispositivo({ motorista, padrao }: { motorista: ReactElement; padrao: ReactElement }) {
  return useMotoristaMobile() ? motorista : padrao
}

const ROTAS_COM_PERMISSAO: { path: string; permissao: Permissao; elemento: ReactElement }[] = [
  { path: '/solicitacoes', permissao: 'solicitacoes.acessar', elemento: <SolicitacoesPage /> },
  { path: '/triagem-svo', permissao: 'triagemSvo.acessar', elemento: <Navigate to="/solicitacoes?aba=svo" replace /> },
  { path: '/viagens', permissao: 'viagens.acessar', elemento: <TelaPorDispositivo motorista={<MotoristaViagens />} padrao={<ViagensPage />} /> },
  { path: '/minhas-coletas', permissao: 'coletasProprias.acessar', elemento: <MinhasColetasSvoPage /> },
  { path: '/agenda', permissao: 'agenda.acessar', elemento: <AgendaPage /> },
  { path: '/abastecimento', permissao: 'abastecimentos.acessar', elemento: <TelaPorDispositivo motorista={<MotoristaAbastecimento />} padrao={<AbastecimentoPage />} /> },
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

      {/* Páginas públicas (sem login): só existem com a flag `solicitacaoExterna` (SCRUM-249/250) */}
      <Route element={<RotaComRecurso recurso="solicitacaoExterna" />}>
        <Route element={<PublicLayout />}>
          <Route path="/acompanhar" element={<AcompanharSolicitacaoPage />} />
        </Route>
      </Route>

      {/* Rotas de demonstração direta das páginas de erro */}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/500" element={<ServerErrorPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<RotaProtegida />}>
        <Route element={<LayoutRoute />}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<TelaPorDispositivo motorista={<MotoristaInicio />} padrao={<HomePage />} />} />
          <Route path="/dashboard" element={<Navigate to="/inicio" replace />} />
          <Route path="/sobre" element={<SobreNosPage />} />
          <Route element={<RotaComPermissao permissao="veiculos.acessar" />}>
            <Route path="/veiculos" element={<TelaPorDispositivo motorista={<MotoristaVeiculo />} padrao={<VeiculosPage />} />} />
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
