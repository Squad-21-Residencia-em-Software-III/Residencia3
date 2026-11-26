import { describe, expect, it } from 'vitest';
import {
  montarAvisoExcecaoSolicitada,
  montarAvisoExcecaoDecidida,
  destinatariosExcecaoOdometro,
} from '../services/eventosExcecaoOdometro';

describe('Eventos de excecao de odometro A9 e A10', () => {
  it('A9 prepara aviso de solicitacao', () => {
    const aviso = montarAvisoExcecaoSolicitada(15);

    expect(aviso.tipo).toBe('EXCECAO_ODOMETRO_SOLICITADA');
    expect(aviso.ocorrencia).toBe('SAIDA:15:solicitada');
    expect(aviso.urlDestino).toBe('/viagens');
    expect(aviso.push.categoria).toBe('ODOMETRO');
    expect(aviso.push.tag).toBe('excecao-odometro-15');
  });

  it('A10 prepara aviso de aprovacao', () => {
    const aviso = montarAvisoExcecaoDecidida(15, 'APROVADA');

    expect(aviso.tipo).toBe('EXCECAO_ODOMETRO_DECIDIDA');
    expect(aviso.ocorrencia).toBe('SAIDA:15:aprovada');
    expect(aviso.mensagem).toContain('aprovado');
    expect(aviso.push.corpo).toContain('aprovado');
  });

  it('A10 prepara aviso de recusa', () => {
    const aviso = montarAvisoExcecaoDecidida(15, 'RECUSADA');

    expect(aviso.tipo).toBe('EXCECAO_ODOMETRO_DECIDIDA');
    expect(aviso.ocorrencia).toBe('SAIDA:15:recusada');
    expect(aviso.mensagem).toContain('recusado');
    expect(aviso.push.corpo).toContain('recusado');
  });

  it('nao inclui justificativas sensiveis no Push', () => {
    for (const decisao of ['APROVADA', 'RECUSADA'] as const) {
      const aviso = montarAvisoExcecaoDecidida(15, decisao);

      expect(aviso.push.corpo).not.toContain('justificativa');
      expect(aviso.push.categoria).toBe('ODOMETRO');
      expect(aviso.urlDestino).toBe('/viagens');
    }
  });
});
it('seleciona apenas gestores administrativos e administradores ativos para A9', async () => {
  const filtros: unknown[] = [];
  const consulta = {
    where(filtro: unknown) { filtros.push(filtro); return consulta; },
    whereIn(coluna: string, valores: string[]) { filtros.push([coluna, valores]); return consulta; },
    orderBy() { return consulta; },
    async pluck() { return [1, 2]; },
  };
  const trx = (() => consulta) as unknown as import('knex').Knex.Transaction;
  expect(await destinatariosExcecaoOdometro(trx)).toEqual([1, 2]);
  expect(filtros).toEqual([{ ativo: true }, ['perfil', ['ADMINISTRADOR', 'GESTOR_FROTA']]]);
});
