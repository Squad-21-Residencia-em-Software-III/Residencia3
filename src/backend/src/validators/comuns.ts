import { z } from 'zod';

export const emailSchema = z
  .string({ error: 'O e-mail é obrigatório' })
  .trim()
  .toLowerCase()
  .pipe(z.email('E-mail inválido').max(255, 'O e-mail deve ter no máximo 255 caracteres'));

export const senhaSchema = z
  .string({ error: 'A senha é obrigatória' })
  .min(8, 'A senha deve ter no mínimo 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'A senha deve conter ao menos uma letra')
  .regex(/\d/, 'A senha deve conter ao menos um número');

export const idParamSchema = z.object({
  id: z.coerce.number({ error: 'ID inválido' }).int('ID inválido').positive('ID inválido'),
});
