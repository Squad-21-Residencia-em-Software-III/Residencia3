import { z } from 'zod';
import { FORMATOS_EXPORTACAO, TIPOS_RELATORIO } from '../constants/relatorios';

const dataSchema = (campo: string) =>
  z.iso.date({ error: `O campo ${campo} deve ser uma data no formato AAAA-MM-DD` }).optional();

export const tipoRelatorioParamSchema = z.object({
  tipo: z.enum(TIPOS_RELATORIO, {
    error: `Tipo de relatório inválido. Aceitos: ${TIPOS_RELATORIO.join(', ')}`,
  }),
});

// Período opcional e inclusivo, no mesmo formato do dashboard
export const exportarRelatorioQuerySchema = z
  .object({
    formato: z.enum(FORMATOS_EXPORTACAO, {
      error: `Formato inválido. Aceitos: ${FORMATOS_EXPORTACAO.join(', ')}`,
    }),
    inicio: dataSchema('inicio'),
    fim: dataSchema('fim'),
  })
  .refine(({ inicio, fim }) => !inicio || !fim || inicio <= fim, {
    error: 'A data inicial deve ser anterior ou igual à final',
    path: ['inicio'],
  });

export type ExportarRelatorioQuery = z.infer<typeof exportarRelatorioQuerySchema>;
export type PeriodoRelatorio = Pick<ExportarRelatorioQuery, 'inicio' | 'fim'>;
