import { z } from 'zod';
import { STATUS_SOLICITACAO_SVO } from '../models/solicitacaoSvoModel';

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

export type CriarSolicitacaoSvoInput = z.infer<typeof criarSolicitacaoSvoSchema>;
export type ListarSolicitacoesSvoInput = z.infer<typeof listarSolicitacoesSvoQuerySchema>;
