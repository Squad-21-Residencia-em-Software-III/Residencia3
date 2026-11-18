import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integrantesSvoService } from '../services/integrantesSvoService';
import { usuarioModel } from '../models/usuarioModel';
import { auditoriaModel } from '../models/auditoriaModel';

const { trx } = vi.hoisted(() => ({ trx: vi.fn() }));
vi.mock('../config/database', () => ({ db: { transaction: (fn: (conn: typeof trx) => unknown) => fn(trx) } }));
vi.mock('../models/usuarioModel', () => ({ usuarioModel: { atualizar: vi.fn() } }));
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { USUARIOS: 'USUARIOS' },
}));

describe('edição específica de integrante SVO', () => {
  const registros = [{ id: 3, perfil: 'INTEGRANTE_SVO', email: 'anterior@teste.invalid' },
    { id: 4, perfil: 'MOTORISTA_SVO', email: 'ocupado@teste.invalid' }];

  beforeEach(() => {
    vi.resetAllMocks();
    trx.mockImplementation(() => {
      let encontrados = registros;
      const query = {
        where: (filtro: Record<string, unknown>) => {
          encontrados = encontrados.filter((u) => Object.entries(filtro).every(([k, v]) => u[k as keyof typeof u] === v));
          return query;
        },
        whereNot: ({ id }: { id: number }) => { encontrados = encontrados.filter((u) => u.id !== id); return query; },
        forUpdate: () => query,
        first: async () => encontrados[0],
      };
      return query;
    });
  });

  it.each([4, 99])('rejeita perfil diferente ou conta inexistente (%i)', async (id) => {
    await expect(integrantesSvoService.atualizar(id, { nome: 'Nome novo' }, 7)).rejects.toMatchObject({ statusCode: 404 });
    expect(usuarioModel.atualizar).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('rejeita e-mail já cadastrado, inclusive de outro perfil', async () => {
    await expect(integrantesSvoService.atualizar(3, { email: 'ocupado@teste.invalid' }, 7)).rejects.toMatchObject({ statusCode: 409 });
    expect(usuarioModel.atualizar).not.toHaveBeenCalled();
  });

  it('converte violação de unicidade concorrente em conflito, sem auditoria de sucesso', async () => {
    vi.mocked(usuarioModel.atualizar).mockRejectedValueOnce(Object.assign(new Error(), { code: '23505' }));
    await expect(integrantesSvoService.atualizar(3, { email: 'novo@teste.invalid' }, 7)).rejects.toMatchObject({ statusCode: 409 });
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('audita autor, alvo e campos dentro da mesma transação, sem registrar valores', async () => {
    const atualizado = { id: 3, nome: 'Nome novo', email: 'novo@teste.invalid' };
    vi.mocked(usuarioModel.atualizar).mockResolvedValueOnce(atualizado as never);
    await expect(integrantesSvoService.atualizar(3, { nome: atualizado.nome, email: atualizado.email }, 7)).resolves.toEqual(atualizado);
    expect(auditoriaModel.registrar).toHaveBeenCalledWith({
      usuario_id: 7, modulo: 'USUARIOS', acao: 'ATUALIZOU_INTEGRANTE_SVO id=3 campos=nome,email',
    }, trx);
  });
});
