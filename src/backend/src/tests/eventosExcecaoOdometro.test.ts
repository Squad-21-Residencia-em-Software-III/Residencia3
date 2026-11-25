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
    expect(aviso.ocorrencia).toBe('solicitada');
    expect(aviso.urlDestino).toBe('/viagens');
    expect(aviso.push.categoria).toBe('VIAGENS');
    expect(aviso.push.tag).toBe('excecao-odometro-15');
  });

  it('A10 prepara aviso de aprovacao', () => {
    const aviso = montarAvisoExcecaoDecidida(15, 'APROVADA');

    expect(aviso.tipo).toBe('EXCECAO_ODOMETRO_DECIDIDA');
    expect(aviso.ocorrencia).toBe('aprovada');
    expect(aviso.mensagem).toContain('aprovado');
    expect(aviso.push.corpo).toContain('aprovado');
  });

  it('A10 prepara aviso de recusa', () => {
    const aviso = montarAvisoExcecaoDecidida(15, 'RECUSADA');

    expect(aviso.tipo).toBe('EXCECAO_ODOMETRO_DECIDIDA');
    expect(aviso.ocorrencia).toBe('recusada');
    expect(aviso.mensagem).toContain('recusado');
    expect(aviso.push.corpo).toContain('recusado');
  });

  it('nao inclui justificativas sensiveis no Push', () => {
    for (const decisao of ['APROVADA', 'RECUSADA'] as const) {
      const aviso = montarAvisoExcecaoDecidida(15, decisao);

      expect(aviso.push.corpo).not.toContain('justificativa');
      expect(aviso.push.categoria).toBe('VIAGENS');
      expect(aviso.urlDestino).toBe('/viagens');
    }
  });
});
describe('Destinatarios das excecoes de odometro', () => {
  function criarTransacaoFalsa(
    administradores: number[],
    gestoresFrota: number[],
    gestoresSvo: number[]
  ) {
    const consultas: string[] = [];

    const trx = ((tabela: string) => {
      consultas.push(tabela);

      const consulta: any = {
        where(filtros: Record<string, unknown>) {
          if (tabela === 'usuarios') {
            if (filtros.perfil === 'ADMINISTRADOR') {
              consulta.resultado = administradores;
            } else if (filtros.perfil === 'GESTOR_FROTA') {
              consulta.resultado = gestoresFrota;
            }
          }

          if (tabela === 'usuarios as u') {
            consulta.resultado = gestoresSvo;
          }

          return consulta;
        },
        join() {
          return consulta;
        },
        distinct() {
          return consulta;
        },
        async pluck() {
          return consulta.resultado ?? [];
        },
      };

      return consulta;
    }) as unknown as import('knex').Knex.Transaction;

    return { trx, consultas };
  }

  it('A9 administrativo seleciona administradores e gestores de frota', async () => {
    const { trx, consultas } = criarTransacaoFalsa([1, 2], [3, 4], [5]);

    const ids = await destinatariosExcecaoOdometro(trx, 'ADMINISTRATIVA');

    expect(ids).toEqual([1, 2, 3, 4]);
    expect(consultas).not.toContain('usuarios as u');
  });

  it('A9 SVO seleciona administradores e gestores associados', async () => {
    const { trx, consultas } = criarTransacaoFalsa([1], [3], [5, 6]);

    const ids = await destinatariosExcecaoOdometro(trx, 'SVO');

    expect(ids).toEqual([1, 5, 6]);
    expect(consultas).toContain('usuarios as u');
  });

  it('remove IDs duplicados dos destinatarios', async () => {
    const { trx } = criarTransacaoFalsa([1, 2], [2, 3], []);

    const ids = await destinatariosExcecaoOdometro(trx, 'ADMINISTRATIVA');

    expect(ids).toEqual([1, 2, 3]);
  });
});
describe('Filtros de seguranca dos destinatarios A9', () => {
  it('exige gestores SVO ativos e associados a unidade SVO', async () => {
    const filtros: Record<string, unknown>[] = [];
    const tabelas: string[] = [];
    const juncoes: string[] = [];

    const trx = ((tabela: string) => {
      tabelas.push(tabela);

      const consulta = {
        where(filtro: Record<string, unknown>) {
          filtros.push(filtro);
          return consulta;
        },
        join(tabelaAssociada: string) {
          juncoes.push(tabelaAssociada);
          return consulta;
        },
        distinct() {
          return consulta;
        },
        async pluck() {
          return [];
        },
      };

      return consulta;
    }) as unknown as import('knex').Knex.Transaction;

    await destinatariosExcecaoOdometro(trx, 'SVO');

    expect(tabelas).toContain('usuarios as u');
    expect(filtros).toContainEqual({
      perfil: 'ADMINISTRADOR',
      ativo: true,
    });
    expect(filtros).toContainEqual({
      'u.perfil': 'GESTOR_SVO',
      'u.ativo': true,
      'unidade.nome': 'SVO',
    });
    expect(juncoes).toContain('gestores_unidades as gu');
    expect(juncoes).toContain('unidades as unidade');
  });
});