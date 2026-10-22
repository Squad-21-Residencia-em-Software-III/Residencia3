import { z } from 'zod';

export const criarVeiculoSchema = z
  .object({
    placa: z
      .string({ error: 'A placa é obrigatória' })
      .trim()
      .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .pipe(
        z
          .string()
          .min(7, 'A placa deve ter no mínimo 7 caracteres')
          .max(10, 'A placa deve ter no máximo 10 caracteres')
      ),
    modelo: z
      .string({ error: 'O modelo é obrigatório' })
      .trim()
      .min(2, 'O modelo deve ter no mínimo 2 caracteres')
      .max(100, 'O modelo deve ter no máximo 100 caracteres'),
    tipo_frota: z.enum(['ADMINISTRATIVA', 'SVO'], {
      error: 'Tipo de frota inválido. Valores aceitos: ADMINISTRATIVA, SVO',
    }),
    capacidade_maxima: z
      .number({ error: 'A capacidade máxima é obrigatória' })
      .int('A capacidade máxima deve ser um número inteiro')
      .min(1, 'A capacidade máxima deve ser de no mínimo 1 passageiro/óbito'),
  })
  .refine(
    (dados) => {
      if (dados.tipo_frota === 'SVO' && dados.capacidade_maxima > 4) {
        return false;
      }
      return true;
    },
    {
      message: 'Veículos da frota SVO podem ter capacidade máxima de até 4',
      path: ['capacidade_maxima'],
    }
  );

export type CriarVeiculoInput = z.infer<typeof criarVeiculoSchema>;