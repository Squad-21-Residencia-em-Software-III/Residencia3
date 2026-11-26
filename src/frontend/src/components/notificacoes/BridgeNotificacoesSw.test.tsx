import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { NotificacoesProvider } from '../../contexts/NotificacoesContext';
import { ApiError } from '../../services/api/http';
import { CHAVE_CLIQUE_PUSH, TIPO_MSG_NAVEGAR_NOTIFICACAO } from '../../sw/logicaPushSw';
import { PERFIS } from '../../types/usuario';
import { BridgeNotificacoesSw } from './BridgeNotificacoesSw';

const mockUseAuth = vi.fn();
const mockMarcarLida = vi.fn();
const mockObter = vi.fn();
const vinculo = 'A'.repeat(43);
const controlador = window;
const usuario = { id: 15, perfil: PERFIS.INTEGRANTE_SVO };

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('../../sw/estadoPush', () => ({
  lerEstadoPush: async () => ({ vinculo, geracao: '1', encerramento: false }),
}));
vi.mock('../../services/api/notificacoesApi', () => ({
  notificacoesApi: {
    obter: (...args: unknown[]) => mockObter(...args),
    contador: vi.fn().mockResolvedValue({ nao_lidas: 1, versao: 'v1' }),
    marcarLida: (...args: unknown[]) => mockMarcarLida(...args),
  },
}));

function app(path = '/inicio') {
  return (
    <MemoryRouter initialEntries={[path]}>
      <NotificacoesProvider ativoOverride>
        <BridgeNotificacoesSw />
        <Routes>
          <Route path="/" element={<div>Tela Início</div>} />
          <Route path="/inicio" element={<div>Tela Início</div>} />
          <Route path="/minhas-coletas" element={<div>Tela Minhas Coletas</div>} />
          <Route path="/viagens" element={<div>Tela Viagens</div>} />
        </Routes>
      </NotificacoesProvider>
    </MemoryRouter>
  );
}

describe('BridgeNotificacoesSw', () => {
  let sw: EventTarget;
  const swOriginal = navigator.serviceWorker;
  const flagOriginal = RECURSOS_BACKEND.webPush;

  beforeEach(() => {
    vi.resetAllMocks();
    RECURSOS_BACKEND.webPush = true;
    sessionStorage.clear();
    mockUseAuth.mockReturnValue({ usuario });
    mockMarcarLida.mockResolvedValue({ id: 42, nao_lidas: 0 });
    sw = Object.assign(new EventTarget(), { controller: controlador });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  });

  afterEach(() => {
    RECURSOS_BACKEND.webPush = flagOriginal;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: swOriginal });
  });

  const clicar = (source: Window | null, vinculoDoAviso = vinculo) => act(async () => {
    sw.dispatchEvent(new MessageEvent('message', {
      source, data: { tipo: TIPO_MSG_NAVEGAR_NOTIFICACAO, notificacao_id: 42, vinculo: vinculoDoAviso },
    }));
  });

  it('espera a autorização, usa o destino da API e aplica fallback por perfil', async () => {
    let resolver!: (item: { id: number; url_destino: string }) => void;
    const resposta = new Promise<{ id: number; url_destino: string }>((resolve) => { resolver = resolve; });
    mockObter.mockReturnValue(resposta);
    render(app());
    await clicar(controlador);
    expect(mockObter).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    expect(screen.getByText('Tela Início')).toBeInTheDocument();
    expect(mockMarcarLida).not.toHaveBeenCalled();

    await act(async () => resolver({ id: 42, url_destino: '/viagens' }));
    expect(screen.getByText('Tela Minhas Coletas')).toBeInTheDocument();
    expect(mockMarcarLida).toHaveBeenCalledWith(42);
  });

  it('recusa mensagens sem origem no SW ou de outro vínculo', async () => {
    render(app());
    await clicar(null);
    await clicar(controlador, 'B'.repeat(43));
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('mantém a intenção ao abrir deslogado e revalida após autenticação', async () => {
    mockUseAuth.mockReturnValue({ usuario: null });
    mockObter.mockResolvedValue({ id: 42, url_destino: '/minhas-coletas' });
    const { rerender } = render(app('/?aviso=42'));
    expect(screen.getByText('Tela Início')).toBeInTheDocument();
    expect(mockObter).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CHAVE_CLIQUE_PUSH)).toBe('42');

    mockUseAuth.mockReturnValue({ usuario });
    rerender(app('/?aviso=42'));
    await screen.findByText('Tela Minhas Coletas');
    expect(sessionStorage.getItem(CHAVE_CLIQUE_PUSH)).toBeNull();
  });

  it('usa fallback e preserva a leitura se a notificação é de outra conta ou foi revogada', async () => {
    mockObter.mockRejectedValue(new ApiError('Indisponível', 404));
    render(app());
    await clicar(controlador);
    await screen.findByText('Tela Minhas Coletas');
    expect(mockMarcarLida).not.toHaveBeenCalled();
  });

  it('descarta a resposta antiga após uma troca de sessão', async () => {
    let resolver!: (item: { id: number; url_destino: string }) => void;
    const resposta = new Promise<{ id: number; url_destino: string }>((resolve) => { resolver = resolve; });
    mockObter.mockReturnValueOnce(resposta).mockRejectedValue(new ApiError('Sem rede', 0));
    const { rerender } = render(app());
    await clicar(controlador);
    mockUseAuth.mockReturnValue({ usuario: { id: 16, perfil: PERFIS.GESTOR_FROTA }, versaoSessao: 2 });
    rerender(app());
    await act(async () => resolver({ id: 42, url_destino: '/viagens' }));
    expect(mockObter).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHAVE_CLIQUE_PUSH)).toBeNull();
    expect(screen.getByText('Tela Início')).toBeInTheDocument();
    expect(mockMarcarLida).not.toHaveBeenCalled();
  });
});
