
import { z } from 'zod';

export const criarAbastecimentoSchema = z.object({
  veiculo_id: z.number().int().positive(),
  motorista_id: z.number().int().positive(),
  fornecedor_id: z.number().int().positive().nullish(),

  data_abastecimento: z.iso.date(),

  quilometragem: z.number().int().nonnegative(),

  litros: z.number().positive(),

  valor_total: z.number().positive(),

  posto_combustivel: z.string().trim().max(150).optional(),
});

export type CriarAbastecimentoInput =
  z.infer<typeof criarAbastecimentoSchema>;
