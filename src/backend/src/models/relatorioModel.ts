import type { Knex } from 'knex';
import { db } from '../config/database';
import { FUSO_RELATORIOS } from '../constants/relatorios';
import type { TipoOperacao } from '../validators/viagemSchemas';
import type { PeriodoRelatorio } from '../validators/relatorioSchemas';
import { VIAGENS_UNIFICADAS_SQL } from './viagemModel';

export type LinhaRelatorio = Record<string, unknown>;

// Coluna do tipo date: comparação direta, inclusiva nas duas pontas
function periodoPorData(consulta: Knex.QueryBuilder, coluna: string, { inicio, fim }: PeriodoRelatorio): void {
  if (inicio) consulta.where(coluna, '>=', inicio);
  if (fim) consulta.where(coluna, '<=', fim);
}

// Instante (timestamptz): do início do dia inicial ao fim do dia final, no horário de Brasília
function periodoPorInstante(consulta: Knex.QueryBuilder, expressao: string, { inicio, fim }: PeriodoRelatorio): void {
  if (inicio) {
    consulta.whereRaw(`${expressao} >= (CAST(? AS date)::timestamp AT TIME ZONE ?)`, [inicio, FUSO_RELATORIOS]);
  }
  if (fim) {
    consulta.whereRaw(`${expressao} < ((CAST(? AS date) + 1)::timestamp AT TIME ZONE ?)`, [fim, FUSO_RELATORIOS]);
  }
}

// Datas (tipo date) saem como texto AAAA-MM-DD para não sofrerem conversão de fuso no driver
const COMO_TEXTO = (coluna: string, apelido: string) => db.raw(`to_char(${coluna}, 'YYYY-MM-DD') AS ${apelido}`);

export const relatorioModel = {
  // Mesmo critério de período do dashboard: saída efetiva ou, na falta dela, a prevista
  async viagens(tipos: TipoOperacao[], periodo: PeriodoRelatorio, limite: number): Promise<LinhaRelatorio[]> {
    const consulta = db
      .select(
        'id',
        'tipo_operacao',
        'origem',
        'destino',
        'finalidade',
        'solicitante_nome',
        'inicio_previsto',
        'fim_previsto',
        'veiculo_placa',
        'veiculo_modelo',
        'motorista_nome',
        'km_inicial',
        'km_final',
        'data_hora_efetiva_saida',
        'data_hora_efetiva_chegada',
        'status',
      )
      .from(db.raw(`(${VIAGENS_UNIFICADAS_SQL}) AS viagens`))
      .whereIn('tipo_operacao', tipos);

    periodoPorInstante(consulta, 'COALESCE(data_hora_efetiva_saida, inicio_previsto)', periodo);

    return consulta.orderByRaw('COALESCE(data_hora_efetiva_saida, inicio_previsto) DESC NULLS LAST, id DESC').limit(limite);
  },

  async abastecimentos(periodo: PeriodoRelatorio, limite: number): Promise<LinhaRelatorio[]> {
    const consulta = db('abastecimentos as a')
      .leftJoin('veiculos as v', 'v.id', 'a.veiculo_id')
      .leftJoin('motoristas as m', 'm.id', 'a.motorista_id')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .leftJoin('fornecedores as f', 'f.id', 'a.fornecedor_id')
      .select(
        'a.id',
        COMO_TEXTO('a.data_abastecimento', 'data_abastecimento'),
        'v.placa as veiculo_placa',
        'v.modelo as veiculo_modelo',
        'u.nome as motorista_nome',
        'f.nome as fornecedor_nome',
        'a.posto_combustivel',
        'a.quilometragem',
        'a.litros',
        'a.valor_total',
        db.raw('ROUND(a.valor_total / a.litros, 2) AS preco_por_litro'),
      );

    periodoPorData(consulta, 'a.data_abastecimento', periodo);

    return consulta.orderBy('a.data_abastecimento', 'desc').orderBy('a.id', 'desc').limit(limite);
  },

  async manutencoes(periodo: PeriodoRelatorio, limite: number): Promise<LinhaRelatorio[]> {
    const consulta = db('manutencoes as ma')
      .leftJoin('veiculos as v', 'v.id', 'ma.veiculo_id')
      .leftJoin('fornecedores as f', 'f.id', 'ma.fornecedor_id')
      .select(
        'ma.id',
        COMO_TEXTO('ma.data_manutencao', 'data_manutencao'),
        'v.placa as veiculo_placa',
        'v.modelo as veiculo_modelo',
        'ma.tipo_manutencao',
        'f.nome as fornecedor_nome',
        'ma.descricao',
        'ma.custo',
        'ma.status',
      );

    periodoPorData(consulta, 'ma.data_manutencao', periodo);

    return consulta.orderBy('ma.data_manutencao', 'desc').orderBy('ma.id', 'desc').limit(limite);
  },

  async multas(periodo: PeriodoRelatorio, limite: number): Promise<LinhaRelatorio[]> {
    const consulta = db('multas as mu')
      .leftJoin('veiculos as v', 'v.id', 'mu.veiculo_id')
      .leftJoin('motoristas as m', 'm.id', 'mu.motorista_id')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .select(
        'mu.id',
        'mu.data_infracao',
        'v.placa as veiculo_placa',
        'v.modelo as veiculo_modelo',
        'u.nome as motorista_nome',
        'mu.id_infracao',
        'mu.orgao_autuador',
        'mu.descricao',
        'mu.pontos',
        'mu.valor',
        COMO_TEXTO('mu.data_vencimento', 'data_vencimento'),
        'mu.status_pagamento',
      );

    periodoPorInstante(consulta, 'mu.data_infracao', periodo);

    return consulta.orderBy('mu.data_infracao', 'desc').orderBy('mu.id', 'desc').limit(limite);
  },
};
