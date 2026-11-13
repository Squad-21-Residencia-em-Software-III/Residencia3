
import { z } from 'zod';

const dataComFuso = z.iso.datetime({ offset: true });

export const consultarDisponibilidadeEquipesQuerySchema = z
  .object({
    inicio: dataComFuso,
    fim: dataComFuso,
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
