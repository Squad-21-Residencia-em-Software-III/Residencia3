import { z } from 'zod';
import { AppError } from '../errors/AppError';

const id = z.number().int().positive();
const referencia = {
  paradaId: id,
  versaoRoteiro: z.number().int().nonnegative(),
  chaveIdempotencia: z.uuid(),
};

const decisaoParadaSchema = z.discriminatedUnion('decisao', [
  z.strictObject({ ...referencia, decisao: z.literal('REALIZADA'), evidencia: z.record(z.string(), z.json()).refine((valor) => Object.keys(valor).length > 0) }),
  z.strictObject({ ...referencia, decisao: z.literal('NAO_REALIZADA'), motivo: z.string().trim().min(1).max(500) }),
]);

export function validarDecisaoManualParada(entrada: unknown, estado: {
  viagemAtiva: boolean;
  motoristaId: number;
  atorId: number;
  proximaParadaId: number | null;
  versaoRoteiro: number;
}) {
  if (estado.atorId !== estado.motoristaId) {
    throw new AppError('Motorista sem vínculo com a viagem.', 403, 'PARADA_MOTORISTA_INDEVIDO');
  }
  const decisao = decisaoParadaSchema.parse(entrada);
  if (!estado.viagemAtiva || estado.versaoRoteiro !== decisao.versaoRoteiro ||
      estado.proximaParadaId !== decisao.paradaId) {
    throw new AppError('A parada ou roteiro diverge do andamento atual.', 409, 'PARADA_ESTADO_DESATUALIZADO');
  }
  // A evidência de realização segue para o validador e a persistência de GPS na mesma transação.
  return decisao;
}
