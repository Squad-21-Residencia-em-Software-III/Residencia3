import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificacoesProvider } from '../../contexts/NotificacoesContext';
import { TIPO_MSG_NAVEGAR_NOTIFICACAO } from '../../sw/logicaPushSw';
import { PERFIS } from '../../types/usuario';
import { BridgeNotificacoesSw } from './BridgeNotificacoesSw';

const mockUseAuth = vi.fn();
const mockMarcarLida = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true,
}));

vi.mock('../../services/api/notificacoesApi', () => ({
  notificacoesApi: {
    contador: vi.fn().mockResolvedValue({ nao_lidas: 1, versao: 'v1' }),
    listar: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null, nao_lidas: 1, versao: 'v1' }),
    marcarLida: (...args: unknown[]) => mockMarcarLida(...args),
    marcarTodasLidas: vi.fn().mockResolvedValue({ atualizadas: 0, nao_lidas: 0 }),
    marcarReferenciaLida: vi.fn().mockResolvedValue({ atualizadas: 0, nao_lidas: 0 }),
  },
}));

describe('BridgeNotificacoesSw', () => {
  let swTarget: EventTarget;
  const swOriginal = navigator.serviceWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMarcarLida.mockResolvedValue({ id: 42, nao_lidas: 0, versao: 'v2' });
    swTarget = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swTarget,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: swOriginal,
    });
  });

  it('aplica fallback RBAC para INTEGRANTE_SVO recebendo /viagens e marca notificação como lida', () => {
    mockUseAuth.mockReturnValue({
      usuario: {
        id: 15,
        nome: 'Integrante SVO',
        email: 'integrante@fsph.se.gov.br',
        perfil: PERFIS.INTEGRANTE_SVO,
      },
    });

    render(
      <MemoryRouter initialEntries={['/inicio']}>
        <NotificacoesProvider ativoOverride>
          <BridgeNotificacoesSw />
          <Routes>
            <Route path="/inicio" element={<div>Tela Início</div>} />
            <Route path="/minhas-coletas" element={<div>Tela Minhas Coletas</div>} />
            <Route path="/viagens" element={<div>Tela Viagens</div>} />
          </Routes>
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    act(() => {
      swTarget.dispatchEvent(
        new MessageEvent('message', {
          data: {
            tipo: TIPO_MSG_NAVEGAR_NOTIFICACAO,
            url: '/viagens',
            notificacao_id: 42,
          },
        }),
      );
    });

    expect(screen.getByText('Tela Minhas Coletas')).toBeInTheDocument();
    expect(mockMarcarLida).toHaveBeenCalledWith(42);
  });

  it('ignora mensagem de navegação quando não há usuário autenticado', () => {
    mockUseAuth.mockReturnValue({ usuario: null });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <NotificacoesProvider ativoOverride>
          <BridgeNotificacoesSw />
          <Routes>
            <Route path="/login" element={<div>Tela Login</div>} />
            <Route path="/viagens" element={<div>Tela Viagens</div>} />
          </Routes>
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    act(() => {
      swTarget.dispatchEvent(
        new MessageEvent('message', {
          data: {
            tipo: TIPO_MSG_NAVEGAR_NOTIFICACAO,
            url: '/viagens',
            notificacao_id: 42,
          },
        }),
      );
    });

    expect(screen.getByText('Tela Login')).toBeInTheDocument();
    expect(mockMarcarLida).not.toHaveBeenCalled();
  });
});
