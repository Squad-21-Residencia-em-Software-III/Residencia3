import { z } from 'zod';

export const REGEX_PROTOCOLO_EXTERNO_SVO = /^SVO-[0-9]{8}-[A-Z0-9]{12}$/;
export const REGEX_CREDENCIAL_EXTERNA_SVO = /^[A-Za-z0-9_-]{32,128}$/;
export const REGEX_CHAVE_IDEMPOTENCIA_CRIACAO = /^[A-Za-z0-9._:-]{8,120}$/;
export const REGEX_PROVA_TENTATIVA_CRIACAO = /^[A-Za-z0-9_-]{32,128}$/;

export const CABECALHO_CREDENCIAL_EXTERNA = 'x-credencial-acompanhamento';
export const CABECALHO_CHAVE_IDEMPOTENCIA = 'idempotency-key';
export const CABECALHO_PROVA_TENTATIVA = 'x-prova-tentativa';

export const STATUS_PUBLICO_ACOMPANHAMENTO_SVO = [
  'RECEBIDA',
  'EM_ANALISE',
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'NAO_ACOLHIDA',
  'CANCELADA',
] as const;

export type StatusPublicoAcompanhamentoSvo =
  (typeof STATUS_PUBLICO_ACOMPANHAMENTO_SVO)[number];

export const LABELS_STATUS_PUBLICO_ACOMPANHAMENTO_SVO: Record<
  StatusPublicoAcompanhamentoSvo,
  string
> = {
  RECEBIDA: 'Recebida',
  EM_ANALISE: 'Em análise',
  CONFIRMADA: 'Confirmada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  NAO_ACOLHIDA: 'Não acolhida',
  CANCELADA: 'Cancelada',
};

export const protocoloExternoSvoSchema = z
  .string({ error: 'O protocolo é obrigatório' })
  .trim()
  .toUpperCase()
  .min(12, 'Protocolo inválido')
  .max(64, 'Protocolo inválido')
  .regex(/^[A-Z0-9][A-Z0-9-]{10,62}[A-Z0-9]$/, 'Protocolo inválido');

export const credencialExternaSvoSchema = z
  .string({ error: 'A credencial de acompanhamento é obrigatória' })
  .trim()
  .min(32, 'Credencial de acompanhamento inválida')
  .max(128, 'Credencial de acompanhamento inválida')
  .regex(REGEX_CREDENCIAL_EXTERNA_SVO, 'Credencial de acompanhamento inválida');

export const chaveIdempotenciaCriacaoSchema = z
  .string({ error: 'A chave de idempotência é obrigatória' })
  .trim()
  .min(8, 'A chave de idempotência deve ter entre 8 e 120 caracteres')
  .max(120, 'A chave de idempotência deve ter entre 8 e 120 caracteres')
  .regex(REGEX_CHAVE_IDEMPOTENCIA_CRIACAO, 'Formato de chave de idempotência inválido');

export const provaTentativaCriacaoSchema = z
  .string({ error: 'A prova da tentativa é obrigatória' })
  .trim()
  .min(32, 'Prova de tentativa inválida')
  .max(128, 'Prova de tentativa inválida')
  .regex(REGEX_PROVA_TENTATIVA_CRIACAO, 'Prova de tentativa inválida');

// Corpo para POST /api/solicitacoes-svo/externas/acompanhamento
// Permite credencial no body ou no header X-Credencial-Acompanhamento (nunca na query string / URL)
export const consultarAcompanhamentoBodySchema = z.strictObject(
  {
    protocolo: z
      .string({ error: 'O protocolo é obrigatório' })
      .trim()
      .min(1, 'O protocolo é obrigatório')
      .max(64, 'Protocolo inválido'),
    credencial: z
      .string({ error: 'A credencial de acompanhamento deve ser texto' })
      .trim()
      .min(1, 'A credencial de acompanhamento é obrigatória')
      .max(256, 'Credencial de acompanhamento inválida')
      .optional(),
  },
  { error: 'Campo não permitido na consulta de acompanhamento externo' }
);

// Corpo para POST /api/solicitacoes-svo/externas/recuperar-comprovante
export const recuperarComprovanteTentativaSchema = z.strictObject(
  {
    chave_idempotencia: chaveIdempotenciaCriacaoSchema.optional(),
    prova_tentativa: provaTentativaCriacaoSchema.optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  },
  { error: 'Campo não permitido na recuperação de comprovante externo' }
);

// Corpo para POST /api/solicitacoes-svo/:id/credencial-externa/revogar (uso interno autorizado)
export const revogarCredencialExternaSchema = z.strictObject(
  {
    motivo: z
      .string({ error: 'O motivo da revogação é obrigatório' })
      .trim()
      .min(3, 'O motivo da revogação deve ter pelo menos 3 caracteres')
      .max(120, 'O motivo da revogação deve ter no máximo 120 caracteres'),
  },
  { error: 'Campo não permitido na revogação da credencial externa' }
);

export type ConsultarAcompanhamentoBodyInput = z.infer<
  typeof consultarAcompanhamentoBodySchema
>;
export type RecuperarComprovanteTentativaInput = z.infer<
  typeof recuperarComprovanteTentativaSchema
>;
export type RevogarCredencialExternaInput = z.infer<
  typeof revogarCredencialExternaSchema
>;
