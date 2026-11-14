
import type { Knex } from 'knex';
import { db } from '../config/database';

// Limite da coluna auditorias.acao (varchar 255): uma descrição longa não pode
// derrubar a transação da operação auditada
export const TAMANHO_MAXIMO_ACAO = 255;

export function limitarAcao(acao: string): string {
  return acao.length <= TAMANHO_MAXIMO_ACAO
    ? acao
    : `${acao.slice(0, TAMANHO_MAXIMO_ACAO - 3)}...`;
}

export const MODULOS_AUDITORIA = {
  AUTENTICACAO: 'AUTENTICACAO',
  USUARIOS: 'USUARIOS',
  VEICULOS: 'VEICULOS',
  MANUTENCOES: 'MANUTENCOES',
  SOLICITACOES_VIAGEM: 'SOLICITACOES_VIAGEM',
  SOLICITACOES_SVO: 'SOLICITACOES_SVO',
  MULTAS: 'MULTAS',
  VIAGENS: 'VIAGENS',
  UNIDADES: 'UNIDADES',
  RELATORIOS: 'RELATORIOS',
} as const;

export type ModuloAuditoria =
  (typeof MODULOS_AUDITORIA)[keyof typeof MODULOS_AUDITORIA];

export interface RegistroAuditoria {
  usuario_id: number | null;
  acao: string;
  modulo: ModuloAuditoria;
}

export interface Auditoria extends RegistroAuditoria {
  id: number;
  data_hora: Date;
}

export const auditoriaModel = {
  async registrar(
    registro: RegistroAuditoria,
    conn: Knex = db
  ): Promise<void> {
    await conn('auditorias').insert({
      ...registro,
      acao: limitarAcao(registro.acao),
    });
  },

  async listar(
    pagina: number,
    limite: number,
    conexao: Knex | Knex.Transaction = db,
    idsFiltro?: number[]
  ): Promise<{ dados: Auditoria[]; total: number }> {
    const consulta = conexao<Auditoria>('auditorias');

    if (idsFiltro !== undefined) {
      consulta.whereIn('id', idsFiltro);
    }

    const [dados, contagem] = await Promise.all([
      consulta
        .clone()
        .select(
          'id',
          'usuario_id',
          'acao',
          'modulo',
          'data_hora'
        )
        .orderBy('data_hora', 'desc')
        .orderBy('id', 'desc')
        .limit(limite)
        .offset((pagina - 1) * limite),

      consulta
        .clone()
        .count<{ total: string }[]>({ total: '*' }),
    ]);

    return {
      dados,
      total: Number(contagem[0]?.total ?? 0),
    };
  },
};
