import { beforeEach, describe, expect, it, vi } from 'vitest';
const { dbMock, chamadas } = vi.hoisted(() => ({ dbMock: vi.fn(), chamadas: [] as Array<{ colunas: unknown[]; tipo?: string }> }));
vi.mock('../config/database', () => ({ db: dbMock }));
import { veiculoModel } from '../models/veiculoModel';

describe('consulta segregada de veículos', () => {
  beforeEach(() => {
    chamadas.length = 0;
    dbMock.mockImplementation(() => {
      const chamada: { colunas: unknown[]; tipo?: string } = { colunas: [] };
      chamadas.push(chamada);
      return {
        select: (...colunas: unknown[]) => {
          chamada.colunas = colunas;
          return { where: async (_campo: string, tipo: string) => {
            chamada.tipo = tipo;
            return tipo === 'SVO' ? [{ id: 2, km_atual: 400, tipo_frota: 'SVO' }] : [{ id: 1, tipo_frota: 'ADMINISTRATIVA' }];
          } };
        },
      };
    });
  });
  it('seleciona apenas os campos administrativos permitidos e mantém consulta SVO separada', async () => {
    const resultado = await veiculoModel.listarParaGestorSvo();
    const admin = chamadas.find((chamada) => chamada.tipo === 'ADMINISTRATIVA');
    expect(admin?.colunas).toEqual(['id', 'placa', 'modelo', 'tipo_frota', 'status', 'capacidade_maxima']);
    expect(admin?.colunas).not.toContain('km_atual');
    expect(resultado.map((v) => v.id)).toEqual([1, 2]);
  });
});
