import { z } from 'zod';
import { tipoOperacaoSchema } from './viagemSchemas';

const viagemIdSchema = z.coerce
  .number({ error: 'O campo viagem_id é obrigatório' })
  .int('O campo viagem_id deve ser um número inteiro')
  .positive('O campo viagem_id deve ser positivo');

export const faseOdometroSchema = z.enum(['SAIDA', 'CHEGADA'], {
  error: 'Fase inválida. Valores aceitos: SAIDA, CHEGADA',
});

// Campos de texto do multipart (o arquivo vem à parte, em "arquivo")
export const enviarEvidenciaSchema = z
  .object({
    tipo_operacao: tipoOperacaoSchema,
    viagem_id: viagemIdSchema,
    fase: faseOdometroSchema,
    // Gerada pelo front a cada foto escolhida; o reenvio com a mesma chave não duplica
    chave_idempotencia: z
      .string({ error: 'O campo chave_idempotencia é obrigatório' })
      .trim()
      .toLowerCase()
      .pipe(z.uuid('O campo chave_idempotencia deve ser um UUID')),
  })
  .strict();

export const consultarEvidenciasSchema = z
  .object({
    tipo_operacao: tipoOperacaoSchema,
    viagem_id: viagemIdSchema,
  })
  .strict();

export const arquivoEvidenciaSchema = z
  .object({
    download: z.enum(['0', '1']).optional(),
  })
  .strict();
