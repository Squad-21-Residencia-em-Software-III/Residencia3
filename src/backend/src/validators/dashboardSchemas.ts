import { z } from 'zod';

const dataSchema = (campo: string) =>
  z.iso.date({ error: `O campo ${campo} deve ser uma data no formato AAAA-MM-DD` }).optional();

// Período opcional e inclusivo, aplicado às contagens de solicitações e de viagens
export const consultarDashboardSchema = z
  .object({
    inicio: dataSchema('inicio'),
    fim: dataSchema('fim'),
  })
  .refine(({ inicio, fim }) => !inicio || !fim || inicio <= fim, {
    error: 'A data inicial deve ser anterior ou igual à final',
    path: ['inicio'],
  });

export type ConsultarDashboardInput = z.infer<typeof consultarDashboardSchema>;
