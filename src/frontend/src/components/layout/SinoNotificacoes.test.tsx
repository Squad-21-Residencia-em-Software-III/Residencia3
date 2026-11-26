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
const mockUseAssinaturaPush = vi.fn();
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

vi.mock('../../hooks/useAssinaturaPush', () => ({
  useAssinaturaPush: (...args: unknown[]) => mockUseAssinaturaPush(...args),
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
    referencia_tipo: 'VIAGEM_FROTA',
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
    mockUseAssinaturaPush.mockReturnValue({
      situacao: 'ativa',
      ocupado: false,
      erro: null,
      verificar: vi.fn(),
      ligar: vi.fn(),
      desligar: vi.fn(),
    });
    mockContador.mockResolvedValue({ nao_lidas: 0, versao: 'v1' });
    mockListar.mockResolvedValue({ itens: [], proximo_cursor: null, nao_lidas: 0, versao: 'v1' });
    mockMarcarLida.mockResolvedValue({ id: 1, nao_lidas: 0, versao: 'v2' });
    mockMarcarTodasLidas.mockResolvedValue({ atualizadas: 1, nao_lidas: 0, versao: 'v3' });
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

  it('exibe skeleton, pagina via "Carregar mais" e mostra retencao de 30d lidas e 90d nao lidas', async () => {
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
        itens: [
          criarInApp(2, {
            lida_em: '2026-11-24T12:00:00.000Z',
            operacao: 'SVO',
            referencia_tipo: 'ORDEM_SVO',
          }),
        ],
        proximo_cursor: null,
        nao_lidas: 1,
        versao: 'v1',
      });
    mockContador.mockResolvedValue({ nao_lidas: 1, versao: 'v1' });

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
      versao: 'v1',
    });

    expect(await screen.findByText('Viagem #1 confirmada')).toBeInTheDocument();
    expect(screen.getByText('VG-#1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Viagem #2 confirmada')).toBeInTheDocument();
    expect(screen.getByText('ORD-#2')).toBeInTheDocument();
    expect(
      screen.getByText(/lidas ficam disponíveis por 30 dias e não lidas por 90 dias/i),
    ).toBeInTheDocument();
  });

  it('renderiza aviso com acesso_revogado sem link, permitindo apenas marcar como lida', async () => {
    const user = userEvent.setup();
    mockContador.mockResolvedValue({ nao_lidas: 1, versao: 'v1' });
    mockListar.mockResolvedValue({
      itens: [
        criarInApp(25, {
          titulo: 'Aviso de acesso restrito',
          mensagem: 'Você não possui mais acesso a este registro.',
          url_destino: null,
          acesso_revogado: true,
        }),
      ],
      proximo_cursor: null,
      nao_lidas: 1,
      versao: 'v1',
    });

    render(
      <MemoryRouter initialEntries={['/inicio']}>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes />
          <Routes>
            <Route path="/inicio" element={<div>Tela Início</div>} />
            <Route path="/viagens" element={<div>Tela Viagens</div>} />
          </Routes>
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(await screen.findByTestId('notificacao-revogada-25')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Marcar como lida' }));
    await waitFor(() => expect(mockMarcarLida).toHaveBeenCalledWith(25));
    expect(screen.getByText('Tela Início')).toBeInTheDocument();
  });

  it('marca item como lido e navega ao clicar, e suporta "Marcar avisos exibidos como lidos"', async () => {
    const user = userEvent.setup();
    mockContador.mockResolvedValue({ nao_lidas: 2, versao: 'v1' });
    mockListar.mockResolvedValue({
      itens: [criarInApp(10), criarInApp(11)],
      proximo_cursor: null,
      nao_lidas: 2,
      versao: 'v1',
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

    await user.click(screen.getByRole('button', { name: /marcar avisos exibidos como lidos/i }));
    await waitFor(() => expect(mockMarcarTodasLidas).toHaveBeenCalledWith([10, 11]));

    await user.click(screen.getByText('Viagem #10 confirmada'));
    expect(screen.getByText('Lista de Viagens')).toBeInTheDocument();
  });

  it('exibe erro com botão "Tentar novamente" e modo offline', async () => {
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

    mockListar.mockResolvedValueOnce({
      itens: [criarInApp(5)],
      proximo_cursor: null,
      nao_lidas: 1,
      versao: 'v1',
    });
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByText('Viagem #5 confirmada')).toBeInTheDocument();
    unmount();

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

  it('respeita a flag webPush e integra o botao Ativar ao fluxo oficial useAssinaturaPush (SCRUM-238)', async () => {
    const user = userEvent.setup();
    const ligarMock = vi.fn().mockResolvedValue(undefined);
    mockUseAssinaturaPush.mockReturnValue({
      situacao: 'inativa',
      ocupado: false,
      erro: null,
      verificar: vi.fn(),
      ligar: ligarMock,
      desligar: vi.fn(),
    });

    // Com flag webPush desligada, não mostra faixa nem chama useAssinaturaPush
    const { unmount } = render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes webPushOverride={false} />
        </NotificacoesProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(screen.queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument();
    expect(mockUseAssinaturaPush).not.toHaveBeenCalled();
    unmount();

    // Com flag webPush ligada, o botão Ativar chama push.ligar()
    const { unmount: unmount2 } = render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <SinoNotificacoes webPushOverride />
        </NotificacoesProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /notificações/i }));
    expect(screen.getByText(/ative alertas neste aparelho/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ativar' }));
    expect(ligarMock).toHaveBeenCalledTimes(1);
    unmount2();

    // Bloqueada no MotoristaLayout com webPushOverride
    mockUseAssinaturaPush.mockReturnValue({
      situacao: 'bloqueada',
      ocupado: false,
      erro: null,
      verificar: vi.fn(),
      ligar: vi.fn(),
      desligar: vi.fn(),
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
  });
});
