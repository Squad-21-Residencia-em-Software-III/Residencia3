import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
const { dados } = vi.hoisted(() => ({ dados: { frota: 'SVO', registro: 4, consultas: [] as string[] } }));
vi.mock('../config/database', () => ({ db: (tabela: string) => {
  dados.consultas.push(tabela);
  return { where: () => ({ first: async () => tabela === 'veiculos' ? { tipo_frota: dados.frota } : { veiculo_id: dados.registro } }) };
} }));
import { restringirFrotaAdministrativa } from '../middlewares/restringirFrotaAdministrativa';

describe('segregação de históricos por frota', () => {
  beforeEach(() => { dados.frota = 'SVO'; dados.consultas = []; });
  it.each(['multa', 'manutencao'] as const)('nega ao gestor de frota alteração direta de %s SVO', async (tipo) => {
    const next = vi.fn();
    const req = { usuario: { id: 1, perfil: 'GESTOR_FROTA' }, params: { id: '8' }, body: {} } as unknown as Request;
    await expect(restringirFrotaAdministrativa(tipo)(req, {} as Response, next)).rejects.toMatchObject({ statusCode: 403 });
    expect(next).not.toHaveBeenCalled();
  });
  it('bloqueia histórico por veículo SVO e permite administrativo', async () => {
    const next = vi.fn();
    const req = { usuario: { id: 1, perfil: 'GESTOR_FROTA' }, params: { veiculoId: '4' }, body: {} } as unknown as Request;
    await expect(restringirFrotaAdministrativa('veiculo-param')(req, {} as Response, next)).rejects.toMatchObject({ statusCode: 403 });
    dados.frota = 'ADMINISTRATIVA';
    await restringirFrotaAdministrativa('veiculo-param')(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
  it('preserva acesso do administrador', async () => {
    const next = vi.fn();
    const req = { usuario: { id: 1, perfil: 'ADMINISTRADOR' }, params: { id: '8' }, body: {} } as unknown as Request;
    await restringirFrotaAdministrativa('multa')(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(dados.consultas).toEqual([]);
  });
});
