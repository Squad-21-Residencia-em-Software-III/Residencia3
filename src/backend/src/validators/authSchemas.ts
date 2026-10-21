import { z } from 'zod';
import { emailSchema, senhaSchema } from './comuns';

export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string({ error: 'A senha é obrigatória' }).min(1, 'A senha é obrigatória'),
});

export const alterarSenhaSchema = z
  .object({
    senhaAtual: z.string({ error: 'A senha atual é obrigatória' }).min(1, 'A senha atual é obrigatória'),
    novaSenha: senhaSchema,
  })
  .refine((d) => d.senhaAtual !== d.novaSenha, {
    message: 'A nova senha deve ser diferente da senha atual',
    path: ['novaSenha'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>;
