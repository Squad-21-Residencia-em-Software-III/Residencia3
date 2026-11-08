import type { Knex } from 'knex';
import { db } from '../config/database';

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

export interface Auditoria extends RegistroAuditoria {
  id: number;
  data_hora: Date;
}

export const auditoriaModel = {
  async registrar(registro: RegistroAuditoria, conn: Knex = db): Promise<void> {
    await conn('auditorias').insert(registro);
  },

  async listar(): Promise<Auditoria[]> {
    return db('auditorias')
      .select('id', 'usuario_id', 'acao', 'modulo', 'data_hora')
      .orderBy('data_hora', 'desc')
      .orderBy('id', 'desc');
  },
};
