import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database', () => ({
  db: { transaction: vi.fn(async (callback: (trx: unknown) => unknown) => callback('trx')) },
}));

vi.mock('../services/senhaService', () => ({
  HASH_FICTICIO: 'hash-ficticio',
  senhaService: { comparar: vi.fn(), gerarHash: vi.fn(async () => 'hash-novo') },
}));

vi.mock('../models/auditoriaModel', async (importOriginal) => {
  const original = await importOriginal<typeof import('../models/auditoriaModel')>();
  return { ...original, auditoriaModel: { registrar: vi.fn() } };
});

import type { Knex } from 'knex';
import { usuarioModel } from '../models/usuarioModel';
import { usuarioService } from '../services/usuarioService';

// Conexão falsa que registra a consulta montada pelo model
function conexaoFalsa(linhas: unknown[]) {
  const consulta = {
    where: vi.fn(() => consulta),
    update: vi.fn(() => consulta),
    returning: vi.fn(async () => linhas),
    select: vi.fn(() => consulta),
    first: vi.fn(() => consulta),
  };
  const conn = Object.assign(
    vi.fn(() => consulta),
    { raw: vi.fn((sql: string) => ({ sql })) }
  );
  return { conn: conn as unknown as Knex, consulta, raw: conn.raw };
}

describe('usuarioModel.incrementarVersaoSessao', () => {
  it('incrementa no próprio UPDATE, sem ler e depois gravar, e devolve a nova versão', async () => {
    const { conn, consulta, raw } = conexaoFalsa([{ versao_sessao: 5 }]);

    await expect(usuarioModel.incrementarVersaoSessao(7, conn)).resolves.toBe(5);

    expect(consulta.where).toHaveBeenCalledWith({ id: 7 });
    expect(raw).toHaveBeenCalledWith('versao_sessao + 1');
    expect(consulta.update).toHaveBeenCalledWith({ versao_sessao: { sql: 'versao_sessao + 1' } });
    expect(consulta.returning).toHaveBeenCalledWith('versao_sessao');
    expect(consulta.select).not.toHaveBeenCalled();
    expect(consulta.first).not.toHaveBeenCalled();
  });

  it('falha quando o usuário não existe, para desfazer a transação', async () => {
    const { conn } = conexaoFalsa([]);

    await expect(usuarioModel.incrementarVersaoSessao(99, conn)).rejects.toThrow();
  });
});

describe('usuarioService.redefinirSenha', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(usuarioModel, 'buscarPorId').mockResolvedValue({ id: 2 } as never);
    vi.spyOn(usuarioModel, 'atualizar').mockResolvedValue({ id: 2 } as never);
  });

  it('incrementa a versão da sessão na mesma transação da nova senha', async () => {
    const incrementar = vi.spyOn(usuarioModel, 'incrementarVersaoSessao').mockResolvedValue(3);

    await usuarioService.redefinirSenha(2, 'NovaSenha@456', 1);

    expect(usuarioModel.atualizar).toHaveBeenCalledWith(2, { senha: 'hash-novo' }, 'trx');
    expect(incrementar).toHaveBeenCalledWith(2, 'trx');
  });

  it('propaga a falha do incremento (a transação não é confirmada)', async () => {
    vi.spyOn(usuarioModel, 'incrementarVersaoSessao').mockRejectedValue(new Error('falha no banco'));

    await expect(usuarioService.redefinirSenha(2, 'NovaSenha@456', 1)).rejects.toThrow('falha no banco');
  });
});
