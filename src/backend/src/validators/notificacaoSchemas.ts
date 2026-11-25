import { z } from 'zod';
import { LISTA_REFERENCIAS_NOTIFICACAO } from '../constants/referenciasNotificacao';

const MAX_INTEGER = 2_147_483_647;
const CURSOR = /^(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d{6}Z\|([1-9]\d{0,9})$/;

const idSchema = z.number({ error: 'ID inválido' }).int('ID inválido').positive('ID inválido').max(MAX_INTEGER, 'ID inválido');

// Formato do `proximo_cursor`: data em UTC com microssegundos e id. A data precisa existir, para não virar erro no banco
const cursorSchema = z.string({ error: 'Cursor inválido' }).transform((valor, ctx) => {
  const [, data, id] = CURSOR.exec(valor) ?? [];
  const instante = new Date(`${data}Z`);
  if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 19) !== data || Number(id) > MAX_INTEGER) {
    ctx.addIssue({ code: 'custom', message: 'Cursor inválido' });
    return z.NEVER;
  }
  return { em: valor.split('|')[0]!, id: Number(id) };
});

const LIMITE_INVALIDO = 'O limite deve ser um número inteiro de 1 a 50';

export const listarNotificacoesSchema = z.object({
  limit: z.coerce.number({ error: LIMITE_INVALIDO }).int(LIMITE_INVALIDO).min(1, LIMITE_INVALIDO).max(50, LIMITE_INVALIDO).default(20),
  cursor: cursorSchema.optional(),
  apenas_nao_lidas: z
    .enum(['true', 'false'], { error: 'Use true ou false' })
    .transform((valor) => valor === 'true')
    .optional(),
});

export const notificacaoParamSchema = z.object({ id: z.coerce.number({ error: 'ID inválido' }).pipe(idSchema) });

/** `ate_id`: o aviso mais novo que o usuário viu. Os que chegaram depois continuam não lidos. */
export const lerTodasSchema = z.object({ ate_id: idSchema.optional() });

export const lerReferenciaSchema = z.object({
  referencia_tipo: z.enum(LISTA_REFERENCIAS_NOTIFICACAO, {
    error: `O tipo da referência deve ser um destes: ${LISTA_REFERENCIAS_NOTIFICACAO.join(', ')}`,
  }),
  referencia_id: idSchema,
});

export type ListarNotificacoes = z.infer<typeof listarNotificacoesSchema>;
