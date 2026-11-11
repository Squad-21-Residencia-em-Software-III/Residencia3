import type { Knex } from 'knex';
import { db } from '../config/database';

// Limite da coluna auditorias.acao (varchar 255): uma descrição longa não pode
// derrubar a transação da operação auditada
export const TAMANHO_MAXIMO_ACAO = 255;

export function limitarAcao(acao: string): string {
  return acao.length <= TAMANHO_MAXIMO_ACAO ? acao : `${acao.slice(0, TAMANHO_MAXIMO_ACAO - 3)}...`;
}

export const MODULOS_AUDITORIA = {
  AUTENTICACAO: 'AUTENTICACAO',
  USUARIOS: 'USUARIOS',
  VEICULOS: 'VEICULOS',
  MANUTENCOES: 'MANUTENCOES',
  SOLICITACOES_VIAGEM: 'SOLICITACOES_VIAGEM',
  MULTAS: 'MULTAS',
  VIAGENS: 'VIAGENS',
  UNIDADES: 'UNIDADES',
} as const;

export type ModuloAuditoria = (typeof MODULOS_AUDITORIA)[keyof typeof MODULOS_AUDITORIA];

export interface RegistroAuditoria {
  usuario_id: number | null;
  acao: string;
  modulo: ModuloAuditoria;
}

export const auditoriaModel = {
  async registrar(registro: RegistroAuditoria, conn: Knex = db): Promise<void> {
    await conn('auditorias').insert({ ...registro, acao: limitarAcao(registro.acao) });
  },
};
