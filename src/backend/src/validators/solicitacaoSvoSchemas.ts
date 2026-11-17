import { z } from 'zod';
import { STATUS_SOLICITACAO_SVO } from '../models/solicitacaoSvoModel';

export const TAMANHO_MAXIMO_MOTIVO_RECUSA_SVO = 500;

const textoMotivoSchema = z
  .string({ error: 'O motivo da recusa é obrigatório' })
  .trim()
  .min(1, 'O motivo da recusa é obrigatório')
  .max(
    TAMANHO_MAXIMO_MOTIVO_RECUSA_SVO,
    `O motivo da recusa deve ter no máximo ${TAMANHO_MAXIMO_MOTIVO_RECUSA_SVO} caracteres`,
  );

// status e registrante_id são definidos pelo servidor; campos extras são rejeitados
export const criarSolicitacaoSvoSchema = z.strictObject(
  {
    dados_solicitante: z
      .string({ error: 'Os dados do solicitante são obrigatórios' })
      .trim()
      .min(1, 'Os dados do solicitante são obrigatórios')
      .max(2000, 'Os dados do solicitante devem ter no máximo 2000 caracteres'),

    local_ocorrencia: z
      .string({ error: 'O local da ocorrência é obrigatório' })
      .trim()
      .min(1, 'O local da ocorrência é obrigatório')
      .max(255, 'O local da ocorrência deve ter no máximo 255 caracteres'),

    material_sensivel: z
      .boolean({ error: 'O campo material sensível deve ser verdadeiro ou falso' })
      .optional()
      .default(false),
  },
  { error: 'Campo não permitido na solicitação SVO' },
);

export const listarSolicitacoesSvoQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(STATUS_SOLICITACAO_SVO, {
      error: `Status inválido. Aceitos: ${STATUS_SOLICITACAO_SVO.join(', ')}`,
    })
    .optional(),
});

// Estado, autor e data da confirmação são definidos exclusivamente no servidor
export const confirmarSolicitacaoSvoSchema = z.strictObject(
  {},
  { error: 'A confirmação não aceita campos no corpo da requisição' },
);

// Aceita motivo_recusa (contrato SVO) ou motivo (padrão compartilhado), normalizando em motivo_recusa
export const recusarSolicitacaoSvoSchema = z
  .strictObject(
    {
      motivo_recusa: textoMotivoSchema.optional(),
      motivo: textoMotivoSchema.optional(),
    },
    { error: 'Campo não permitido na recusa da solicitação SVO' },
  )
  .superRefine((dados, ctx) => {
    if (!dados.motivo_recusa && !dados.motivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivo_recusa'],
        message: 'O motivo da recusa é obrigatório',
      });
    }
    if (dados.motivo_recusa && dados.motivo && dados.motivo_recusa !== dados.motivo) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivo_recusa'],
        message: 'Informe apenas um campo de motivo da recusa',
      });
    }
  })
  .transform((dados) => ({
    motivo_recusa: (dados.motivo_recusa ?? dados.motivo)!,
  }));

export type CriarSolicitacaoSvoInput = z.infer<typeof criarSolicitacaoSvoSchema>;
export type ListarSolicitacoesSvoInput = z.infer<typeof listarSolicitacoesSvoQuerySchema>;
export type RecusarSolicitacaoSvoInput = z.infer<typeof recusarSolicitacaoSvoSchema>;