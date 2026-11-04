
import { z } from 'zod';

export const criarSolicitacaoViagemSchema = z.object({
  origem: z.string().trim().min(1, 'Informe a origem').max(255),

  destino: z.string().trim().min(1, 'Informe o destino').max(255),

  finalidade: z.string().trim().min(1, 'Informe a finalidade'),

  data_saida_desejada: z.string().datetime({
    offset: true,
  }),

  data_chegada_desejada: z.string().datetime({
    offset: true,
  }).nullish(),
});

export const recusarSolicitacaoViagemSchema = z.object({
  // Limitado para caber no campo de ação da auditoria (255 caracteres)
  motivo: z.string().trim().min(1, 'Informe o motivo').max(200, 'O motivo deve ter no máximo 200 caracteres').optional(),
});

export type CriarSolicitacaoViagemInput = z.infer<
  typeof criarSolicitacaoViagemSchema
>;
