import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TriagemSvoPage from './TriagemSvoPage';
import { DrawerTriagemSvo } from './triagemSvo/DrawerTriagemSvo';
import { solicitacoesSvoApi } from '../services/api/solicitacoesSvoApi';
import { ApiError } from '../services/api/http';
import type {
  ConfirmacaoSvo,
  ListaSolicitacoesSvo,
  OrdemSvo,
  SolicitacaoSvo,
} from '../types/solicitacaoSvo';

vi.mock('../services/api/solicitacoesSvoApi', () => ({
  solicitacoesSvoApi: { listar: vi.fn(), buscarPorId: vi.fn(), confirmar: vi.fn() },
}));

const api = vi.mocked(solicitacoesSvoApi);

const solicitacao = (id: number, extra: Partial<SolicitacaoSvo> = {}): SolicitacaoSvo => ({
  id,
  registrante_id: 4,
  dados_solicitante: `Familiar ${id} - (79) 99999-0000`,
  local_ocorrencia: `Rua ${id}, Aracaju`,
  material_sensivel: false,
  status: 'EM_TRIAGEM',
  observacoes: null,
  criado_em: '2026-11-12T12:00:00.000Z',
  confirmado_por: null,
  confirmado_em: null,
  ...extra,
});

const ordem = (id: number, solicitacaoId: number): OrdemSvo => ({
  id,
  solicitacao_id: solicitacaoId,
  status: 'AGUARDANDO_ALOCACAO',
  veiculo_id: null,
  motorista_id: null,
  equipe_id: null,
  capacidade_utilizada: 1,
});

const lista = (
  dados: SolicitacaoSvo[],
  pagina = 1,
  total = dados.length,
): ListaSolicitacoesSvo => ({
  dados,
  paginacao: { pagina, limite: 20, total, totalPaginas: Math.ceil(total / 20) },
});

async function abrirSolicitacao(id: number) {
  await userEvent.click(await screen.findByRole('button', { name: `Analisar solicitação ${id}` }));
  return screen.findByRole('dialog');
}

describe('TriagemSvoPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lista as solicitações em triagem por padrão', async () => {
    api.listar.mockResolvedValue(
      lista([solicitacao(2, { material_sensivel: true }), solicitacao(1)]),
    );

    render(<TriagemSvoPage />);

    expect(await screen.findByText('Rua 2, Aracaju')).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledWith({ pagina: 1, limite: 20, status: 'EM_TRIAGEM' });
    expect(screen.getByText('Material sensível')).toBeInTheDocument();
    expect(screen.getAllByText('Em triagem').length).toBeGreaterThan(0);
  });

  it('informa quando não há solicitações aguardando triagem', async () => {
    api.listar.mockResolvedValue(lista([]));

    render(<TriagemSvoPage />);

    expect(await screen.findByText('Nenhuma solicitação aguardando triagem.')).toBeInTheDocument();
  });

  it('filtra por status e permite ver todas', async () => {
    api.listar.mockResolvedValue(lista([]));
    render(<TriagemSvoPage />);
    await screen.findByText('Nenhuma solicitação aguardando triagem.');

    const filtro = screen.getByRole('combobox', { name: 'Filtrar por status' });
    await userEvent.selectOptions(filtro, 'CONFIRMADA');
    await waitFor(() =>
      expect(api.listar).toHaveBeenLastCalledWith({ pagina: 1, limite: 20, status: 'CONFIRMADA' }),
    );

    await userEvent.selectOptions(filtro, 'TODAS');
    await waitFor(() =>
      expect(api.listar).toHaveBeenLastCalledWith({ pagina: 1, limite: 20, status: undefined }),
    );
  });

  it('em falha de comunicação mostra o erro e permite tentar novamente', async () => {
    api.listar.mockRejectedValueOnce(new ApiError('Não foi possível conectar ao servidor.', 0));
    api.listar.mockResolvedValueOnce(lista([solicitacao(5)]));

    render(<TriagemSvoPage />);

    expect(await screen.findByText('Não foi possível conectar ao servidor.')).toBeInTheDocument();
    // A falha não é apresentada como lista vazia
    expect(screen.queryByText('Nenhuma solicitação aguardando triagem.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Rua 5, Aracaju')).toBeInTheDocument();
  });

  it('sem permissão não oferece nova tentativa', async () => {
    api.listar.mockRejectedValue(new ApiError('Acesso negado', 403));

    render(<TriagemSvoPage />);

    expect(
      await screen.findByText('Você não tem permissão para consultar as solicitações SVO.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('exibe os dados da solicitação para análise, ainda sem ordem', async () => {
    api.listar.mockResolvedValue(lista([solicitacao(7)]));
    api.buscarPorId.mockResolvedValue({
      ...solicitacao(7, { observacoes: 'Óbito em domicílio', material_sensivel: true }),
      ordem: null,
    });

    render(<TriagemSvoPage />);
    const painel = await abrirSolicitacao(7);

    expect(await within(painel).findByText('Familiar 7 - (79) 99999-0000')).toBeInTheDocument();
    expect(within(painel).getByText('Óbito em domicílio')).toBeInTheDocument();
    expect(within(painel).getByText(/exige protocolo específico/)).toBeInTheDocument();
    expect(
      within(painel).getByText('A ordem é gerada pelo servidor quando a solicitação é confirmada.'),
    ).toBeInTheDocument();
    expect(api.buscarPorId).toHaveBeenCalledWith(7);
  });

  it('confirma e mostra a ordem de coleta devolvida pela API', async () => {
    api.listar.mockResolvedValue(lista([solicitacao(7)]));
    api.buscarPorId.mockResolvedValue({ ...solicitacao(7), ordem: null });
    let concluir: (valor: ConfirmacaoSvo) => void = () => {};
    api.confirmar.mockReturnValue(new Promise((resolve) => (concluir = resolve)));

    render(<TriagemSvoPage />);
    const painel = await abrirSolicitacao(7);
    await userEvent.click(
      await within(painel).findByRole('button', { name: 'Confirmar e gerar ordem' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Enquanto a API não responde, nenhuma ordem é exibida e não há como reenviar
    expect(screen.getByRole('button', { name: 'Processando...' })).toBeDisabled();
    expect(within(painel).queryByText(/Ordem #/)).not.toBeInTheDocument();

    concluir({
      solicitacao: solicitacao(7, {
        status: 'CONFIRMADA',
        confirmado_por: 4,
        confirmado_em: '2026-11-12T13:00:00.000Z',
      }),
      ordem: ordem(31, 7),
    });

    expect(await within(painel).findByText('Ordem #31')).toBeInTheDocument();
    expect(within(painel).getByText('Aguardando alocação')).toBeInTheDocument();
    expect(
      within(painel).getByText(/Ordem de coleta #31 gerada pelo servidor/),
    ).toBeInTheDocument();
    expect(within(painel).getByText('Confirmada')).toBeInTheDocument();
    // Já confirmada: a ação some
    expect(
      within(painel).queryByRole('button', { name: 'Confirmar e gerar ordem' }),
    ).not.toBeInTheDocument();
    expect(api.confirmar).toHaveBeenCalledTimes(1);
    expect(api.confirmar).toHaveBeenCalledWith(7);
    // A lista é recarregada para refletir o novo status
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2));
  });

  it('em falha de confirmação não apresenta ordem e permite tentar de novo', async () => {
    api.listar.mockResolvedValue(lista([solicitacao(7)]));
    api.buscarPorId.mockResolvedValue({ ...solicitacao(7), ordem: null });
    api.confirmar.mockRejectedValueOnce(
      new ApiError('Servidor indisponível. Tente novamente em instantes.', 503),
    );

    render(<TriagemSvoPage />);
    const painel = await abrirSolicitacao(7);
    await userEvent.click(
      await within(painel).findByRole('button', { name: 'Confirmar e gerar ordem' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await within(painel).findByText('Servidor indisponível. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(within(painel).queryByText(/Ordem #/)).not.toBeInTheDocument();
    expect(within(painel).queryByText('Solicitação confirmada')).not.toBeInTheDocument();
    expect(within(painel).getByRole('button', { name: 'Confirmar e gerar ordem' })).toBeEnabled();
  });

  it('em conflito (409) mostra o motivo e o estado atual vindo da API', async () => {
    api.listar.mockResolvedValue(lista([solicitacao(7)]));
    api.buscarPorId
      .mockResolvedValueOnce({ ...solicitacao(7), ordem: null })
      // Outra pessoa confirmou antes: a API já tem a ordem
      .mockResolvedValueOnce({ ...solicitacao(7, { status: 'CONFIRMADA' }), ordem: ordem(40, 7) });
    api.confirmar.mockRejectedValueOnce(
      new ApiError('O estado da ordem não corresponde ao da solicitação SVO', 409),
    );

    render(<TriagemSvoPage />);
    const painel = await abrirSolicitacao(7);
    await userEvent.click(
      await within(painel).findByRole('button', { name: 'Confirmar e gerar ordem' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await within(painel).findByText('O estado da ordem não corresponde ao da solicitação SVO'),
    ).toBeInTheDocument();
    expect(await within(painel).findByText('Ordem #40')).toBeInTheDocument();
    // Não é apresentada como confirmada nesta tela
    expect(within(painel).queryByText('Solicitação confirmada')).not.toBeInTheDocument();
    expect(
      within(painel).queryByRole('button', { name: 'Confirmar e gerar ordem' }),
    ).not.toBeInTheDocument();
    expect(api.buscarPorId).toHaveBeenCalledTimes(2);
  });

  it('ignora confirmacao anterior ao trocar de solicitacao', async () => {
    api.buscarPorId.mockImplementation(async (id) => ({
      ...solicitacao(id),
      ordem: null,
    }));

    let resolver!: (valor: ConfirmacaoSvo) => void;
    api.confirmar.mockImplementation(
      () => new Promise<ConfirmacaoSvo>((resolve) => {
        resolver = resolve;
      }),
    );

    const onConfirmada = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <DrawerTriagemSvo solicitacaoId={7} onClose={onClose} onConfirmada={onConfirmada} />,
    );

    const painel = await screen.findByRole('dialog');
    expect(await within(painel).findByText('Familiar 7 - (79) 99999-0000')).toBeInTheDocument();

    await userEvent.click(
      within(painel).getByRole('button', { name: 'Confirmar e gerar ordem' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(api.confirmar).toHaveBeenCalledWith(7);

    rerender(
      <DrawerTriagemSvo solicitacaoId={8} onClose={onClose} onConfirmada={onConfirmada} />,
    );

    expect(await within(painel).findByText('Familiar 8 - (79) 99999-0000')).toBeInTheDocument();

    await act(async () => {
      resolver({
        solicitacao: solicitacao(7, { status: 'CONFIRMADA' }),
        ordem: ordem(31, 7),
      });
    });

    expect(within(painel).getByText('Familiar 8 - (79) 99999-0000')).toBeInTheDocument();
    expect(within(painel).queryByText('Ordem #31')).not.toBeInTheDocument();
    expect(within(painel).queryByText('Solicitação confirmada')).not.toBeInTheDocument();
    expect(
      within(painel).getByRole('button', { name: 'Confirmar e gerar ordem' }),
    ).toBeEnabled();
    expect(onConfirmada).not.toHaveBeenCalled();
  });

  it('solicitação que não está em triagem não pode ser confirmada', async () => {
    api.listar.mockResolvedValue(lista([solicitacao(9, { status: 'RECUSADA' })]));
    api.buscarPorId.mockResolvedValue({ ...solicitacao(9, { status: 'RECUSADA' }), ordem: null });

    render(<TriagemSvoPage />);
    const painel = await abrirSolicitacao(9);

    expect(
      await within(painel).findByText('Nenhuma ordem de coleta ativa para esta solicitação.'),
    ).toBeInTheDocument();
    expect(
      within(painel).queryByRole('button', { name: 'Confirmar e gerar ordem' }),
    ).not.toBeInTheDocument();
    expect(api.confirmar).not.toHaveBeenCalled();
  });
});
