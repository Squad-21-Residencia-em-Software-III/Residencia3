import { describe, expect, it } from 'vitest';
import { atualizarVeiculoSchema, criarVeiculoSchema } from '../validators/veiculoSchemas';

const svo = { placa: 'ABC1D23', modelo: 'Van', tipo_frota: 'SVO', capacidade_maxima: 4, km_atual: 0 };

describe('capacidades de veículos', () => {
  it('aceita cabine positiva independente da capacidade de óbitos', () => {
    expect(criarVeiculoSchema.safeParse({ ...svo, lotacao_cabine: 6 }).success).toBe(true);
  });
  it.each([undefined, null, 0, -1, 1.5, '2'])('rejeita cabine inválida em cadastro SVO: %s', (lotacao_cabine) => {
    expect(criarVeiculoSchema.safeParse({ ...svo, lotacao_cabine }).success).toBe(false);
  });
  it('rejeita mais de quatro óbitos e preserva capacidade administrativa superior', () => {
    expect(criarVeiculoSchema.safeParse({ ...svo, capacidade_maxima: 5, lotacao_cabine: 2 }).success).toBe(false);
    expect(criarVeiculoSchema.safeParse({ ...svo, tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 10 }).success).toBe(true);
  });
  it('permite edição parcial de veículo legado sem atribuir cabine', () => {
    const editado = atualizarVeiculoSchema.parse({ capacidade_maxima: 2 });
    expect(editado).toEqual({ capacidade_maxima: 2 });
    expect(atualizarVeiculoSchema.parse({ lotacao_cabine: 3 })).toEqual({ lotacao_cabine: 3 });
    expect(atualizarVeiculoSchema.safeParse({ lotacao_cabine: null }).success).toBe(false);
  });
});
