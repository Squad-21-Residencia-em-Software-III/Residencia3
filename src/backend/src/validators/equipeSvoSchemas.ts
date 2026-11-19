
import { z } from 'zod';

export const nomeEquipeSvoSchema = z.strictObject({
  nome_equipe: z.string().trim().min(1, 'Informe o nome da equipe').max(100),
});

const dataComFuso = z.iso.datetime({ offset: true });

export const consultarDisponibilidadeEquipesQuerySchema = z
  .object({
    inicio: dataComFuso,
    fim: dataComFuso,
    ignorar_ordem_id: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (dados) => new Date(dados.fim).getTime() > new Date(dados.inicio).getTime(),
    {
      message: 'A data final deve ser posterior à data inicial',
      path: ['fim'],
    },
  );

export type ConsultarDisponibilidadeEquipesInput = z.infer<
  typeof consultarDisponibilidadeEquipesQuerySchema
>;
