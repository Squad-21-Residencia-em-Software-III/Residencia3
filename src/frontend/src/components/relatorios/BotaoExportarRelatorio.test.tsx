import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../services/api/http';
import { relatoriosApi } from '../../services/api/relatoriosApi';
import { PERFIS } from '../../types/usuario';
import { BotaoExportarRelatorio } from './BotaoExportarRelatorio';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../services/api/relatoriosApi', () => ({
  relatoriosApi: {
    exportar: vi.fn(),
  },
}));

describe('BotaoExportarRelatorio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      usuario: {
        id: 1,
        nome: 'Gestor Frota',
        email: 'frota@fsph.se.gov.br',
        perfil: PERFIS.GESTOR_FROTA,
        tipo_usuario: 'GESTOR_FROTA',
        ativo: true,
      },
      versaoSessao: 1,
      carregando: false,
      login: vi.fn(),
      logout: vi.fn(),
      temPerfil: () => true,
    });
  });

  it('não renderiza o botão para perfis sem permissão (ex.: GESTOR_SVO e SOLICITANTE)', () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: {
        id: 2,
        nome: 'Gestor SVO',
        email: 'svo@fsph.se.gov.br',
        perfil: PERFIS.GESTOR_SVO,
        tipo_usuario: 'GESTOR_SVO',
        ativo: true,
      },
      versaoSessao: 1,
      carregando: false,
      login: vi.fn(),
      logout: vi.fn(),
      temPerfil: () => true,
    });

    const { container } = render(<BotaoExportarRelatorio tipo="viagens" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('abre o modal, valida período invertido, exibe sucesso com nome do arquivo e trava campos no loading', async () => {
    let resolverExportacao: ((valor: string) => void) | null = null;
    vi.mocked(relatoriosApi.exportar).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverExportacao = resolve;
        }),
    );

    render(<BotaoExportarRelatorio tipo="viagens" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Baixar relatório/i }));

    const dialog = screen.getByRole('dialog');
    expect(screen.getByText('Exportar Relatório · Viagens')).toBeInTheDocument();
    expect(screen.getByText(/frota administrativa/i)).toBeInTheDocument();

    // Seleciona PDF e período invertido
    await user.click(within(dialog).getByRole('button', { name: /PDF \(\.pdf\)/i }));
    const inputsData = document.querySelectorAll('input[type="date"]');
    await user.clear(inputsData[0]);
    await user.type(inputsData[0], '2026-11-20');
    await user.clear(inputsData[1]);
    await user.type(inputsData[1], '2026-11-10');

    await user.click(within(dialog).getByRole('button', { name: 'Baixar relatório' }));
    expect(
      screen.getByText('A data inicial deve ser anterior ou igual à data final.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(relatoriosApi.exportar).not.toHaveBeenCalled();

    // Usa atalho "Todo o período" e inicia download (loading)
    await user.click(within(dialog).getByRole('button', { name: 'Todo o período' }));
    await user.click(within(dialog).getByRole('button', { name: 'Baixar relatório' }));

    expect(within(dialog).getByRole('button', { name: /Gerando arquivo/i })).toBeDisabled();
    expect(inputsData[0]).toBeDisabled();

    resolverExportacao!('relatorio-viagens-2026-11-16.pdf');

    await waitFor(() => {
      expect(screen.getByText(/Download concluído:/i)).toBeInTheDocument();
    });
    expect(screen.getByText('relatorio-viagens-2026-11-16.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Caso não haja registros no período/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Baixar novamente' })).toBeInTheDocument();
    expect(relatoriosApi.exportar).toHaveBeenCalledWith('viagens', 'pdf', {
      inicio: undefined,
      fim: undefined,
    });
  });

  it('esclarece ao Administrador que o relatório de viagens inclui frota administrativa e SVO', async () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: {
        id: 1,
        nome: 'Admin',
        email: 'admin@fsph.se.gov.br',
        perfil: PERFIS.ADMINISTRADOR,
        tipo_usuario: 'ADMINISTRADOR',
        ativo: true,
      },
      versaoSessao: 1,
      carregando: false,
      login: vi.fn(),
      logout: vi.fn(),
      temPerfil: () => true,
    });

    render(<BotaoExportarRelatorio tipo="viagens" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Baixar relatório/i }));

    expect(screen.getByText(/administrativa e SVO/i)).toBeInTheDocument();
  });

  it('exibe erro 422 no PDF com atalho de 1 clique para Excel (.xlsx) e botão Tentar novamente', async () => {
    vi.mocked(relatoriosApi.exportar).mockRejectedValueOnce(
      new ApiError('Limite de 5.000 linhas excedido. Use CSV ou XLSX.', 422),
    );
    render(<BotaoExportarRelatorio tipo="multas" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Baixar relatório/i }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /PDF \(\.pdf\)/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Baixar relatório' }));

    await waitFor(() => {
      expect(
        screen.getByText('Limite de 5.000 linhas excedido. Use CSV ou XLSX.'),
      ).toBeInTheDocument();
    });

    expect(within(dialog).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    // Atalho de 1 clique troca para Excel e limpa o erro
    await user.click(within(dialog).getByRole('button', { name: 'Mudar para Excel (.xlsx)' }));
    expect(
      screen.queryByText('Limite de 5.000 linhas excedido. Use CSV ou XLSX.'),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Baixar relatório' })).toBeInTheDocument();
  });
});
