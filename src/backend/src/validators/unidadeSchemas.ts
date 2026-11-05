import { z } from 'zod';

const idSchema = (campo: string) =>
  z.coerce
    .number({ error: `O campo ${campo} é obrigatório` })
    .int(`O campo ${campo} deve ser um número inteiro`)
    .positive(`O campo ${campo} deve ser positivo`);

export const associarGestorSchema = z.object({
  gestor_id: idSchema('gestor_id'),
});

export const gestorUnidadeParamSchema = z.object({
  id: idSchema('id'),
  gestorId: idSchema('gestorId'),
});
