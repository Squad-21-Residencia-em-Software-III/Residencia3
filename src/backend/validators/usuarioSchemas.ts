import { z } from 'zod';
import { LISTA_PERFIS } from '../src/constants/perfis';
import { emailSchema, senhaSchema } from './comuns';

const nomeSchema = z
  .string({ error: 'O nome é obrigatório' })
  .trim()
  .min(3, 'O nome deve ter no mínimo 3 caracteres')
  .max(255, 'O nome deve ter no máximo 255 caracteres');

const perfilSchema = z.enum(LISTA_PERFIS, { error: `Perfil inválido. Valores aceitos: ${LISTA_PERFIS.join(', ')}` });

export const criarUsuarioSchema = z.object({
  nome: nomeSchema,
  email: emailSchema,
  senha: senhaSchema,
  perfil: perfilSchema,
});

export const atualizarUsuarioSchema = z
  .strictObject(
    {
      nome: nomeSchema.optional(),
      email: emailSchema.optional(),
      perfil: perfilSchema.optional(),
      ativo: z.boolean({ error: 'O campo ativo deve ser true ou false' }).optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? 'Campo não permitido. Para trocar a senha use PATCH /api/usuarios/:id/senha'
          : undefined,
    },
  )
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
    when: (payload) => payload.issues.length === 0,
  });

export const redefinirSenhaSchema = z.object({
  senha: senhaSchema,
});

export const listarUsuariosSchema = z.object({
  pagina: z.coerce.number().int().min(1, 'A página deve ser maior ou igual a 1').default(1),
  limite: z.coerce.number().int().min(1).max(100, 'O limite máximo é 100').default(20),
  busca: z.string().trim().min(1).optional(),
  perfil: perfilSchema.optional(),
  ativo: z
    .enum(['true', 'false'], { error: 'O filtro ativo deve ser true ou false' })
    .transform((v) => v === 'true')
    .optional(),
});

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
export type ListarUsuariosInput = z.infer<typeof listarUsuariosSchema>;
