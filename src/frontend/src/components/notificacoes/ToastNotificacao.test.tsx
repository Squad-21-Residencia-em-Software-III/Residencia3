import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificacoesProvider, useNotificacoes } from '../../contexts/NotificacoesContext';
import { PERFIS } from '../../types/usuario';
import { ToastNotificacao } from './ToastNotificacao';

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
    obter: vi.fn().mockResolvedValue({ id: 501, url_destino: '/viagens', acesso_revogado: false }),
    contador: vi.fn().mockResolvedValue({ nao_lidas: 1 }),
    listar: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null, nao_lidas: 1 }),
    marcarLida: (...args: unknown[]) => mockMarcarLida(...args),
    marcarTodasLidas: vi.fn().mockResolvedValue({ atualizadas: 1, nao_lidas: 0 }),
    marcarReferenciaLida: vi.fn().mockResolvedValue({ atualizadas: 1, nao_lidas: 0 }),
  },
}));

function DisparadorToast({ urlDestino }: { urlDestino: string }) {
  const { notificarEmPrimeiroPlano } = useNotificacoes();
  return (
    <button
      type="button"
      onClick={() =>
        notificarEmPrimeiroPlano({
          id: 501,
          titulo: 'Coleta SVO alocada',
          mensagem: 'Equipe definida para a coleta #501.',
          severidade: 'warning',
          url_destino: urlDestino,
        })
      }
    >
      Disparar
    </button>
  );
}

describe('ToastNotificacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarcarLida.mockResolvedValue({ id: 501, nao_lidas: 0 });
  });

  it('exibe toast em primeiro plano e aplica fallback RBAC ao clicar em Abrir', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      usuario: {
        id: 22,
        nome: 'Integrante SVO',
        email: 'integrante@fsph.se.gov.br',
        perfil: PERFIS.INTEGRANTE_SVO,
      },
    });

    render(
      <MemoryRouter initialEntries={['/inicio']}>
        <NotificacoesProvider ativoOverride>
          <DisparadorToast urlDestino="/viagens" />
          <ToastNotificacao />
          <Routes>
            <Route path="/inicio" element={<div>Tela Início</div>} />
            <Route path="/minhas-coletas" element={<div>Tela Minhas Coletas</div>} />
            <Route path="/viagens" element={<div>Tela Viagens</div>} />
          </Routes>
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Disparar' }));
    expect(screen.getByTestId('toast-notificacao')).toBeInTheDocument();
    expect(screen.getByText('Coleta SVO alocada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(mockMarcarLida).toHaveBeenCalledWith(501);
    expect(screen.getByText('Tela Minhas Coletas')).toBeInTheDocument();
    expect(screen.queryByTestId('toast-notificacao')).not.toBeInTheDocument();
  });

  it('fecha o toast ao clicar em Fechar', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      usuario: {
        id: 1,
        nome: 'Admin',
        email: 'admin@fsph.se.gov.br',
        perfil: PERFIS.ADMINISTRADOR,
      },
    });

    render(
      <MemoryRouter>
        <NotificacoesProvider ativoOverride>
          <DisparadorToast urlDestino="/viagens" />
          <ToastNotificacao />
        </NotificacoesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Disparar' }));
    expect(screen.getByTestId('toast-notificacao')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    expect(screen.queryByTestId('toast-notificacao')).not.toBeInTheDocument();
  });
});
