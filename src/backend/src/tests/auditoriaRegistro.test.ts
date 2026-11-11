import { describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';

vi.mock('../config/database', () => ({ db: vi.fn() }));

import { auditoriaModel, limitarAcao, MODULOS_AUDITORIA, TAMANHO_MAXIMO_ACAO } from '../models/auditoriaModel';

function conexaoFalsa() {
  const insert = vi.fn().mockResolvedValue(undefined);
  const conn = vi.fn(() => ({ insert })) as unknown as Knex;
  return { conn, insert };
}

describe('Registro de auditoria', () => {
  it('mantém ações dentro do limite sem alteração', () => {
    expect(limitarAcao('CRIOU_VEICULO id=1 placa=ABC1D23')).toBe('CRIOU_VEICULO id=1 placa=ABC1D23');
    expect(limitarAcao('a'.repeat(TAMANHO_MAXIMO_ACAO))).toHaveLength(TAMANHO_MAXIMO_ACAO);
  });

  it('trunca ações maiores que a coluna para não derrubar a operação auditada', () => {
    const resultado = limitarAcao('x'.repeat(400));

    expect(resultado).toHaveLength(TAMANHO_MAXIMO_ACAO);
    expect(resultado.endsWith('...')).toBe(true);
  });

  it('grava na tabela auditorias usando a conexão (transação) recebida', async () => {
    const { conn, insert } = conexaoFalsa();

    await auditoriaModel.registrar(
      { usuario_id: 3, acao: `RECUSOU_SOLICITACAO_VIAGEM id=1 motivo="${'m'.repeat(300)}"`, modulo: MODULOS_AUDITORIA.SOLICITACOES_VIAGEM },
      conn,
    );

    expect(conn).toHaveBeenCalledWith('auditorias');
    const gravado = insert.mock.calls[0]![0];
    expect(gravado.usuario_id).toBe(3);
    expect(gravado.modulo).toBe('SOLICITACOES_VIAGEM');
    expect(gravado.acao).toHaveLength(TAMANHO_MAXIMO_ACAO);
    expect(gravado.acao.startsWith('RECUSOU_SOLICITACAO_VIAGEM id=1')).toBe(true);
  });
});
