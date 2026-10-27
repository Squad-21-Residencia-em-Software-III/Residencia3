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
      .string({ error: 'Descrição é obrigatória' })
      .trim()
      .min(1, 'A descrição da manutenção é obrigatória')
      .max(1000, 'A descrição deve ter no máximo 1000 caracteres'),

    custo: z
      .number({ error: 'Custo é obrigatório' })
      .min(0, 'O custo não pode ser negativo'),

    status: z
      .enum(['AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA'], {
        error: 'Status inválido. Aceitos: AGENDADA, EM_ANDAMENTO, CONCLUIDA',
      })
      .default('AGENDADA'),
  })
  .strict();

export type CriarManutencaoInput = z.infer<typeof criarManutencaoSchema>;

export const atualizarStatusManutencaoSchema = z
  .object({
    status: z.enum(['AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA'], {
      error: 'Status inválido. Aceitos: AGENDADA, EM_ANDAMENTO, CONCLUIDA',
    }),
  })
  .strict();

export type AtualizarStatusManutencaoInput = z.infer<typeof atualizarStatusManutencaoSchema>;

