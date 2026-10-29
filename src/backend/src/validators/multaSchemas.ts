import { z } from 'zod';
import { STATUS_PAGAMENTO_MULTA } from '../models/multaModel';

export const criarMultaSchema = z.object({
  veiculo_id: z
    .number({ error: 'O veículo é obrigatório' })
    .int('O veículo deve possuir um identificador válido')
    .positive('O veículo deve possuir um identificador válido'),

  motorista_id: z
    .number()
    .int('O motorista deve possuir um identificador válido')
    .positive('O motorista deve possuir um identificador válido')
    .nullable()
    .optional(),

  data_infracao: z
    .string({ error: 'A data da infração é obrigatória' })
    .min(1, 'A data da infração é obrigatória'),

  valor: z
    .number({ error: 'O valor da multa é obrigatório' })
    .positive('O valor da multa deve ser maior que zero'),

  descricao: z.string().trim().optional().nullable(),

  pontos: z
    .number({ error: 'A pontuação é obrigatória' })
    .int('A pontuação deve ser um número inteiro')
    .nonnegative('A pontuação não pode ser negativa'),

  status_pagamento: z
    .enum(STATUS_PAGAMENTO_MULTA, {
      error: `Status de pagamento inválido. Aceitos: ${STATUS_PAGAMENTO_MULTA.join(', ')}`,
    })
    .optional(),

  data_vencimento: z.string().optional().nullable(),

  id_infracao: z.string().trim().optional().nullable(),

  orgao_autuador: z.string().trim().optional().nullable(),
});

export type CriarMultaInput = z.infer<typeof criarMultaSchema>;