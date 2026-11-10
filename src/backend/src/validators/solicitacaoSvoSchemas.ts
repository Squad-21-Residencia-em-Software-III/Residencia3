import { z } from 'zod';
import { STATUS_SOLICITACAO_SVO } from '../constants/svo';

export const listarSolicitacoesSvoSchema = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(STATUS_SOLICITACAO_SVO).optional(),
}).strict();

// Estado, autor e data da confirmação são definidos exclusivamente no servidor.
export const confirmarSolicitacaoSvoSchema = z.object({}).strict();

export type ListarSolicitacoesSvoInput = z.infer<typeof listarSolicitacoesSvoSchema>;
