import { z } from 'zod';
import type { Perfil } from '../constants/perfis';
import { coordenadasSchema } from './mapasSchemas';
import { tipoOperacaoSchema } from './viagemSchemas';

const operacao = { operacao: tipoOperacaoSchema, id: z.number().int().positive() };
export const referenciaHistoricoSchema = z.strictObject(operacao);
export type ReferenciaHistorico = z.infer<typeof referenciaHistoricoSchema>;
export type AutorHistorico = { id: number; perfil: Perfil };

const cursor = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);
export const consultaHistoricoSchema = z.strictObject({
  ...operacao,
  cursor: cursor.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

export const evidenciaGeograficaSchema = z.object({
  tipo: z.enum(['CHECKPOINT', 'PONTO_PERIODICO', 'LACUNA']),
  marco: z.enum(['SAIDA', 'PARADA', 'CHEGADA', 'ENTREGA', 'FINAL']).nullable(),
  capturadoEm: z.iso.datetime({ offset: true }).nullable(),
  recebidoEm: z.iso.datetime({ offset: true }).nullable(),
  coordenadas: coordenadasSchema.nullable(),
  precisaoMetros: z.number().nonnegative().nullable(),
}).transform((ponto) => ponto.tipo === 'LACUNA' ? { ...ponto, coordenadas: null, precisaoMetros: null } : ponto);

export type EvidenciaGeografica = z.infer<typeof evidenciaGeograficaSchema>;

const revisao = z.object({
  versao: z.number().int().nonnegative(),
  metodo: z.enum(['OSRM', 'HAVERSINE_APROXIMADO', 'INDISPONIVEL']),
  distanciaMetros: z.number().int().nonnegative().nullable(),
  geometriaPlanejada: z.string().nullable(),
}).transform((dado) => dado.metodo === 'OSRM' ? dado : { ...dado, geometriaPlanejada: null });

export const detalheHistoricoSchema = z.object({
  roteiroOriginal: revisao.nullable(),
  alteracoes: z.array(revisao),
  versaoUtilizada: z.number().int().nonnegative().nullable(),
  estadoEvidencias: z.enum(['DISPONIVEL', 'SEM_DADOS', 'INDISPONIVEL', 'DESCARTADO']),
  evidencias: z.array(evidenciaGeograficaSchema).max(100),
  proximoCursor: cursor.nullable(),
}).transform((dado) => dado.estadoEvidencias === 'DISPONIVEL' ? dado : { ...dado, evidencias: [], proximoCursor: null });
