import type { Knex } from 'knex';
import { db } from '../config/database';

export const MODULOS_AUDITORIA = {
  AUTENTICACAO: 'AUTENTICACAO',
  USUARIOS: 'USUARIOS',
  VEICULOS: 'VEICULOS',
  MANUTENCOES: 'MANUTENCOES',
} as const;

export type ModuloAuditoria = (typeof MODULOS_AUDITORIA)[keyof typeof MODULOS_AUDITORIA];

export interface RegistroAuditoria {
  usuario_id: number | null;
  acao: string;
  modulo: ModuloAuditoria;
}

export const auditoriaModel = {
  async registrar(registro: RegistroAuditoria, conn: Knex = db): Promise<void> {
    await conn('auditorias').insert(registro);
  },
};
