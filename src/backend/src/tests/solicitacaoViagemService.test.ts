
import { describe, it, expect, vi } from 'vitest';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../config/database', () => ({ db: { transaction } }));

describe('Solicitação de viagem - regras de datas', () => {
  it('deve rejeitar data de saída no passado', async () => {
    const dados = {
      unidade_id: 2,
      origem: 'Aracaju',
      destino: 'Itabaiana',
      finalidade: 'Visita técnica',
      data_saida_desejada: '2020-01-01T08:00:00-03:00',
    };

    await expect(
      solicitacaoViagemService.criar(dados, 1)
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('deve rejeitar chegada anterior à saída', async () => {
    const dados = {
      unidade_id: 2,
      origem: 'Aracaju',
      destino: 'Itabaiana',
      finalidade: 'Visita técnica',
      data_saida_desejada: '2099-12-10T08:00:00-03:00',
      data_chegada_desejada: '2099-12-09T17:00:00-03:00',
    };

    await expect(
      solicitacaoViagemService.criar(dados, 1)
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('Solicitação administrativa - material sensível (SCRUM-195)', () => {
  it.each([true, false, undefined])('preserva o contrato de cadastro para material_sensivel=%s', async (marcacao) => {
    const dados = {
      unidade_id: 2,
      origem: 'Aracaju',
      destino: 'Itabaiana',
      finalidade: 'Transporte institucional',
      data_saida_desejada: '2099-12-10T08:00:00-03:00',
    };
    const campos = { ...dados, solicitante_id: 1 };
    const linha = {
      ...campos,
      id: 7,
      status: 'PENDENTE_APROVACAO',
      material_sensivel: marcacao ?? false,
    };
    const consultaUnidade = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 2 }),
    };
    const insertSolicitacao = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([linha]) });
    const insertAuditoria = vi.fn().mockResolvedValue(undefined);
    const tabelas = {
      unidades: consultaUnidade,
      solicitacoes_viagem: { insert: insertSolicitacao },
      auditorias: { insert: insertAuditoria },
    };
    const conexao = vi.fn((tabela: keyof typeof tabelas) => tabelas[tabela]);
    transaction.mockImplementationOnce(async (executar: (trx: typeof conexao) => Promise<unknown>) => executar(conexao));

    const resultado = await solicitacaoViagemService.criar(
      marcacao === undefined ? dados : { ...dados, material_sensivel: marcacao },
      1,
    );

    expect(conexao).toHaveBeenCalledWith('solicitacoes_viagem');
    // Omitir a coluna para a opção desmarcada mantém a compatibilidade pré-migration.
    expect(insertSolicitacao).toHaveBeenCalledWith(marcacao ? { ...campos, material_sensivel: true } : campos);
    expect(resultado).toMatchObject({ id: 7, material_sensivel: marcacao ?? false });
    expect(insertAuditoria).toHaveBeenCalledWith(expect.objectContaining({ usuario_id: 1 }));
  });
});
