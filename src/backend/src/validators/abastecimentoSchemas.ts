
import { z } from 'zod';

export const criarAbastecimentoSchema = z.object({
  veiculo_id: z.number().int().positive(),

  motorista_id: z.number().int().positive(),

  data_abastecimento: z.iso.date(),

  quilometragem: z.number().int().nonnegative(),

  litros: z.number().finite().positive(),

  valor_total: z.number().finite().positive(),

  posto_combustivel: z
    .string()
    .trim()
    .min(1, 'Informe o nome do posto utilizado')
    .max(150),
}).strict();

export type CriarAbastecimentoInput =
  z.infer<typeof criarAbastecimentoSchema>;
