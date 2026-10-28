
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

export type CriarSolicitacaoViagemInput = z.infer<
  typeof criarSolicitacaoViagemSchema
>;
