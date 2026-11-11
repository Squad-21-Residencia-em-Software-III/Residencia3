import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AuditoriaPage from './AuditoriaPage';
import { auditoriaApi } from '../services/api/auditoriaApi';
import { ApiError } from '../services/api/http';
import type { ListaAuditorias, RegistroAuditoria } from '../types/auditoria';

vi.mock('../services/api/auditoriaApi', () => ({
  auditoriaApi: { listar: vi.fn() },
}));

const listar = vi.mocked(auditoriaApi.listar);

const registro = (id: number, extra: Partial<RegistroAuditoria> = {}): RegistroAuditoria => ({
  id,
  usuario_id: 1,
  acao: `ACAO_${id}`,
  modulo: 'VIAGENS',
  data_hora: '2026-11-08T12:00:00.000Z',
  ...extra,
});

/** Monta a resposta paginada no formato de GET /auditorias. */
const resposta = (
  dados: RegistroAuditoria[],
  pagina = 1,
  total = dados.length,
): ListaAuditorias => ({
  dados,
  paginacao: { pagina, limite: 20, total, totalPaginas: Math.ceil(total / 20) },
});

const ids = (de: number, ate: number) =>
  Array.from({ length: de - ate + 1 }, (_, i) => registro(de - i));

describe('AuditoriaPage', () => {
  beforeEach(() => {
    listar.mockReset();
  });

  it('exibe os registros retornados pela API', async () => {
    listar.mockResolvedValue(
      resposta([
        registro(2, { acao: 'FINALIZOU_VIAGEM id=3', modulo: 'VIAGENS', usuario_id: 5 }),
        registro(1, { acao: 'LOGIN', modulo: 'MODULO_NOVO', usuario_id: null }),
      ]),
    );

    render(<AuditoriaPage />);

    expect(await screen.findByText('FINALIZOU_VIAGEM id=3')).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith(1, 20);
    expect(screen.getByText('Viagens')).toBeInTheDocument();
    expect(screen.getByText('Usuário #5')).toBeInTheDocument();
    // Módulo sem rótulo conhecido aparece como veio da API
    expect(screen.getByText('MODULO_NOVO')).toBeInTheDocument();
    expect(screen.getByText('Não identificado')).toBeInTheDocument();
  });

  it('informa quando não há registros', async () => {
    listar.mockResolvedValue(resposta([]));

    render(<AuditoriaPage />);

    expect(await screen.findByText('Nenhum registro de auditoria encontrado.')).toBeInTheDocument();
  });

  it('busca cada página no servidor, sem carregar todo o histórico', async () => {
    listar.mockResolvedValueOnce(resposta(ids(25, 6), 1, 25));
    listar.mockResolvedValueOnce(resposta(ids(5, 1), 2, 25));

    render(<AuditoriaPage />);

    expect(await screen.findByText('ACAO_25')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument(); // total vindo da API

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(await screen.findByText('ACAO_5')).toBeInTheDocument();
    expect(screen.queryByText('ACAO_25')).not.toBeInTheDocument();
    expect(listar).toHaveBeenLastCalledWith(2, 20);
  });

  it('indica a atualização em andamento e volta para a primeira página', async () => {
    listar.mockResolvedValueOnce(resposta([registro(1)]));
    let concluir: (valor: ListaAuditorias) => void = () => {};
    listar.mockReturnValueOnce(new Promise((resolve) => (concluir = resolve)));

    render(<AuditoriaPage />);
    await screen.findByText('ACAO_1');

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    const botao = screen.getByRole('button', { name: 'Atualizando...' });
    expect(botao).toBeDisabled();
    expect(listar).toHaveBeenLastCalledWith(1, 20);

    concluir(resposta([registro(2), registro(1)]));

    expect(await screen.findByText('ACAO_2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled();
  });

  it('não expõe dados quando o acesso é negado', async () => {
    listar.mockRejectedValue(new ApiError('Acesso negado', 403));

    render(<AuditoriaPage />);

    expect(
      await screen.findByText('Você não tem permissão para consultar os registros de auditoria.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ACAO_/)).not.toBeInTheDocument();
    // Repetir não muda a permissão, então não há nova tentativa
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('avisa quando a rota ainda não existe no servidor (404)', async () => {
    listar.mockRejectedValue(new ApiError('Not found', 404));

    render(<AuditoriaPage />);

    expect(
      await screen.findByText('A consulta de auditoria ainda não está disponível no servidor.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nenhum registro de auditoria encontrado.')).not.toBeInTheDocument();
  });

  it('em falha de comunicação mostra o erro e permite tentar novamente', async () => {
    listar.mockRejectedValueOnce(
      new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0),
    );
    listar.mockResolvedValueOnce(resposta([registro(7)]));

    render(<AuditoriaPage />);

    expect(
      await screen.findByText('Não foi possível conectar ao servidor. Verifique sua conexão.'),
    ).toBeInTheDocument();
    // A falha não é apresentada como lista vazia
    expect(screen.queryByText('Nenhum registro de auditoria encontrado.')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum registro encontrado')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('ACAO_7')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument(),
    );
  });
});
