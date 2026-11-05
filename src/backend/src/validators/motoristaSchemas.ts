import { z } from 'zod';

export const listarMotoristasSchema = z.object({
  status: z
    .enum(['DISPONIVEL', 'DESIGNADO', 'EM_VIAGEM', 'AFASTADO', 'INATIVO'], {
      error: 'Status inválido. Valores aceitos: DISPONIVEL, DESIGNADO, EM_VIAGEM, AFASTADO, INATIVO',
    })
    .optional(),
  tipo_motorista: z
    .enum(['FROTA', 'SVO'], { error: 'Tipo de motorista inválido. Valores aceitos: FROTA, SVO' })
    .optional(),
});

export type ListarMotoristasFiltros = z.infer<typeof listarMotoristasSchema>;
