import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotificacoesProvider } from '../../contexts/NotificacoesContext';
import type { NotificacaoInApp } from '../../types/notificacao';
import { PERFIS } from '../../types/usuario';
import { MotoristaLayout } from './MotoristaLayout';
import { SinoNotificacoes, rotuloBadge } from './SinoNotificacoes';
import type { NotificacaoItem } from './SinoNotificacoes';

const mockUseAuth = vi.fn();
const mockUseOnlineStatus = vi.fn();
const mockUsePermissoes = vi.fn();
const mockListar = vi.fn();
const mockContador = vi.fn();
const mockMarcarLida = vi.fn();
const mockMarcarTodasLidas = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}));

vi.mock('../../hooks/usePermissoesDispositivo', () => ({
  usePermissoesDispositivo: () => mockUsePermissoes(),
}));

vi.mock('../../services/api/notificacoesApi', () => ({
  notificacoesApi: {
    listar: (...args: unknown[]) => mockListar(...args),
    contador: (...args: unknown[]) => mockContador(...args),
    marcarLida: (...args: unknown[]) => mockMarcarLida(...args),
    marcarTodasLidas: (...args: unknown[]) => mockMarcarTodasLidas(...args),
    marcarReferenciaLida: vi.fn().mockResolvedValue({ atualizadas: 0, nao_lidas: 0 }),
  },
}));

function gerar(qtd: number): NotificacaoItem[] {
  return Array.from({ length: qtd }, (_, i) => ({ id: String(i), titulo: `Aviso ${i}` }));
}

function criarInApp(id: number, overrides: Partial<NotificacaoInApp> = {}): NotificacaoInApp {
  return {
    id,
    tipo: 'VIAGEM_AGENDADA',
    titulo: `Viagem #${id} confirmada`,
    mensagem: 'Veículo disponível no pátio principal.',
    severidade: 'info',
    operacao: 'Administrativo',
    referencia_tipo: 'VIAGEM',
    referencia_id: id,
    url_destino: '/viagens',
    lida_em: null,
    criado_em: new Date().toISOString(),
    ...overrides,
  };
}

describe('SinoNotificacoes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      usuario: {
        id: 1,
        nome: 'Gestor Frota',
        email: 'gestor@fsph.se.gov.br',
        perfil: PERFIS.GESTOR_FROTA,
      },
    });
    mockUseOnlineStatus.mockReturnValue(true);
    mockUsePermissoes.mockReturnValue({
      notificacoes: 'granted',
      geolocalizacao: 'prompt',
      solicitandoNotif: false,
      solicitandoGeo: false,
      solicitarNotificacoes: vi.fn().mockResolvedValue('granted'),
      solicitarGeolocalizacao: vi.fn().mockResolvedValue('granted'),
    });
    mockContador.mockResolvedValue({ nao_lidas: 0 });
    mockListar.mockResolvedValue({ itens: [], proximo_cursor: null, nao_lidas: 0 });
    mockMarcarLida.mockResolvedValue({ id: 1, nao_lidas: 0 });
    mockMarcarTodasLidas.mockResolvedValue({ atualizadas: 1, nao_lidas: 0 });
  });

  it('formata o badge como 99+ acima de 99', () => {
    expect(rotuloBadge(5)).toBe('5');
    expect(rotuloBadge(99)).toBe('99');
    expect(rotuloBadge(100)).toBe('99+');
  });

  it('não mostra badge sem notificações não lidas', () => {
    render(<SinoNotificacoes />);
    expect(screen.queryByTestId('badge-notificacoes')).not.toBeInTheDocument();
  });

  it('mostra 99+ e rótulo acessível com muitas não lidas', () => {
    render(<SinoNotificacoes notificacoes={gerar(150)} />);
    expect(screen.getByTestId('badge-notificacoes')).toHaveTextContent('99+');
    expect(screen.getByRole('button', { name: /mais de 99 não lidas/i })).toBeInTheDocument();
  });

  it('abre o dropdown, mostra estado vazio e atualiza aria-expanded', async () => {
    const user = userEvent.setup();
    render(<SinoNotificacoes />);
    const sino = screen.getByRole('button', { name: 'Notificações' });
    expect(sino).toHaveAttribute('aria-expanded', 'false');

    await user.click(sino);
    expect(sino).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Notificações' })).toBeInTheDocument();
    expect(screen.getByText(/não tem notificações/i)).toBeInTheDocument();
  });

  it('fecha com Escape e devolve o foco ao sino', async () => {
    const user = userEvent.setup();
    render(<SinoNotificacoes notificacoes={gerar(2)} />);
    const sino = screen.getByRole('button', { name: /não lidas/i });
    await user.click(sino);
    expect(screen.getByText('Aviso 0')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sino).toHaveFocus();
  });

  it('fecha ao clicar fora', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SinoNotificacoes />
        <button type="button">Fora</button>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Fora' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exibe skeleton durante carregamento e carrega páginas via "Carregar mais" até o fim da retenção', async () => {
    const user = userEvent.setup();
    let resolverPrimeiraPagina!: (valor: unknown) => void;
    mockListar
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolverPrimeiraPagina = resolve;
          }),
      )
      .mockResolvedValueOnce({
        itens: [criarInApp(2, { lida_em: '2026-11-24T12:00:00.000Z', operacao: 'SVO' })],
        proximo_cursor: null,
        nao_lidas: 1,
      });
    mockContador.mockResolvedValue({ nao_lidas: 1 });

    render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes />
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(screen.getByTestId('skeleton-notificacoes')).toBeInTheDocument();

    resolverPrimeiraPagina({
      itens: [criarInApp(1)],
      proximo_cursor: 'cursor-1',
      nao_lidas: 1,
    });

    expect(await screen.findByText('Viagem #1 confirmada')).toBeInTheDocument();
    expect(screen.getByText('VG-#1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Viagem #2 confirmada')).toBeInTheDocument();
    expect(screen.getByText(/fim das notificações dos últimos 30 dias/i)).toBeInTheDocument();
  });

  it('marca item como lido e navega ao clicar, e suporta "Marcar todas como lidas"', async () => {
    const user = userEvent.setup();
    mockContador.mockResolvedValue({ nao_lidas: 2 });
    mockListar.mockResolvedValue({
      itens: [criarInApp(10), criarInApp(11)],
      proximo_cursor: null,
      nao_lidas: 2,
    });

    render(
      <MemoryRouter initialEntries={['/inicio']}>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes />
          <Routes>
            <Route path="/inicio" element={<div>Início</div>} />
            <Route path="/viagens" element={<div>Lista de Viagens</div>} />
          </Routes>
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(await screen.findByText('Viagem #10 confirmada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /marcar todas como lidas/i }));
    await waitFor(() => expect(mockMarcarTodasLidas).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('Viagem #10 confirmada'));
    expect(screen.getByText('Lista de Viagens')).toBeInTheDocument();
  });

  it('exibe erro com botão "Tentar novamente" e modo offline desabilitando ações de escrita', async () => {
    const user = userEvent.setup();
    mockListar.mockRejectedValueOnce(new Error('Falha no servidor'));

    const { unmount } = render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes />
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(
      await screen.findByText(/não foi possível carregar as notificações/i),
    ).toBeInTheDocument();

    mockListar.mockResolvedValueOnce({ itens: [criarInApp(5)], proximo_cursor: null, nao_lidas: 1 });
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByText('Viagem #5 confirmada')).toBeInTheDocument();
    unmount();

    // Modo offline
    mockUseOnlineStatus.mockReturnValue(false);
    render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes />
        </NotificacoesProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(screen.getByText(/sem conexão/i)).toBeInTheDocument();
  });

  it('exibe faixas de permissão (prompt com Ativar e denied) e renderiza o sino no MotoristaLayout', async () => {
    const user = userEvent.setup();
    const solicitarMock = vi.fn().mockResolvedValue('granted');
    mockUsePermissoes.mockReturnValue({
      notificacoes: 'prompt',
      geolocalizacao: 'prompt',
      solicitandoNotif: false,
      solicitandoGeo: false,
      solicitarNotificacoes: solicitarMock,
      solicitarGeolocalizacao: vi.fn(),
    });

    const { unmount } = render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes />
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(screen.getByText(/ative alertas no dispositivo/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ativar' }));
    expect(solicitarMock).toHaveBeenCalledTimes(1);
    unmount();

    mockUsePermissoes.mockReturnValue({
      notificacoes: 'denied',
      geolocalizacao: 'prompt',
      solicitandoNotif: false,
      solicitandoGeo: false,
      solicitarNotificacoes: vi.fn(),
      solicitarGeolocalizacao: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <MotoristaLayout navItems={[]} title="Viagens" onLogout={vi.fn()}>
            <p>Conteúdo motorista</p>
          </MotoristaLayout>
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    const sinoMotorista = screen.getByRole('button', { name: 'Notificações' });
    expect(sinoMotorista).toBeInTheDocument();
    await user.click(sinoMotorista);
    expect(screen.getByText(/alertas do navegador bloqueados/i)).toBeInTheDocument();
  });
});
