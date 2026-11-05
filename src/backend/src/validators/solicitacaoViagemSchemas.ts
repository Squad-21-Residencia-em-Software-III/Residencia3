
import { z } from 'zod';
import { LISTA_STATUS_SOLICITACAO_VIAGEM } from '../constants/solicitacoesViagem';

export const criarSolicitacaoViagemSchema = z.object({
  // Unidade escolhida pelo solicitante: define quem analisa a solicitação
  unidade_id: z
    .number({ error: 'Informe a unidade da solicitação' })
    .int('A unidade deve ser um número inteiro')
    .positive('A unidade deve ser positiva'),

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

export const listarSolicitacoesViagemSchema = z.object({
  pagina: z.coerce.number().int().min(1, 'A página deve ser maior ou igual a 1').default(1),
  limite: z.coerce.number().int().min(1).max(100, 'O limite máximo é 100').default(20),
  status: z
    .enum(LISTA_STATUS_SOLICITACAO_VIAGEM, {
      error: `Status inválido. Valores aceitos: ${LISTA_STATUS_SOLICITACAO_VIAGEM.join(', ')}`,
    })
    .optional(),
});

export type ListarSolicitacoesViagemInput = z.infer<typeof listarSolicitacoesViagemSchema>;

export type CriarSolicitacaoViagemInput = z.infer<
  typeof criarSolicitacaoViagemSchema
>;
