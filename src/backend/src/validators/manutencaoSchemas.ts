import { z } from 'zod';

export const criarManutencaoSchema = z
  .object({
    veiculo_id: z
      .number({ error: 'ID do veículo é obrigatório' })
      .int('ID do veículo deve ser inteiro')
      .positive('ID do veículo deve ser positivo'),

    fornecedor_id: z
      .number()
      .int('ID do fornecedor deve ser inteiro')
      .positive('ID do fornecedor deve ser positivo')
      .nullable()
      .optional(),

    tipo_manutencao: z.enum(['PREVENTIVA', 'CORRETIVA'], {
      error: 'Tipo de manutenção inválido. Aceitos: PREVENTIVA, CORRETIVA',
    }),

    data_manutencao: z
      .string({ error: 'Data da manutenção é obrigatória' })
      .trim()
      .min(1, 'Data da manutenção é obrigatória'),

    descricao: z
      .string()
      .trim()
      .nullable()
      .optional(),

    custo: z
      .number()
      .nonnegative('Custo deve ser maior ou igual a zero')
      .nullable()
      .optional(),

    status: z
      .enum(['AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'])
      .optional(),
  });

export const atualizarStatusManutencaoSchema = z.object({
  status: z.enum(['AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'], {
    error: 'Status de manutenção inválido',
  }),
});

export type CriarManutencaoInput = z.infer<typeof criarManutencaoSchema>;