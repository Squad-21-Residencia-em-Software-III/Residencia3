import type { Perfil } from './perfis';

export type OperacaoNotificacao = 'Administrativo' | 'SVO';

/**
 * Registro de origem do aviso. Cada tipo é uma tabela e pertence a uma operação só: o mesmo id na viagem da
 * frota e na ordem SVO são registros diferentes.
 */
export const OPERACAO_DA_REFERENCIA = {
  SOLICITACAO_VIAGEM: 'Administrativo',
  VIAGEM_FROTA: 'Administrativo',
  SOLICITACAO_SVO: 'SVO',
  ORDEM_SVO: 'SVO',
} as const satisfies Record<string, OperacaoNotificacao>;

export type ReferenciaNotificacao = keyof typeof OPERACAO_DA_REFERENCIA;

export const LISTA_REFERENCIAS_NOTIFICACAO = Object.keys(OPERACAO_DA_REFERENCIA) as [
  ReferenciaNotificacao,
  ...ReferenciaNotificacao[],
];

/**
 * Vínculo que dá acesso ao registro, igual ao das telas (docs/matriz-de-acesso.md):
 * - `gestao`: vê todos os da operação;
 * - `solicitante`: pediu a viagem;
 * - `condutor`: é quem dirige hoje;
 * - `designado`: está na coleta, sem designação revogada.
 */
export type VinculoComRegistro = 'gestao' | 'solicitante' | 'condutor' | 'designado';

// Tipo ausente: o perfil não tem acesso a esse registro
export const ACESSO_POR_PERFIL: Record<Perfil, Partial<Record<ReferenciaNotificacao, VinculoComRegistro>>> = {
  ADMINISTRADOR: { SOLICITACAO_VIAGEM: 'gestao', VIAGEM_FROTA: 'gestao', SOLICITACAO_SVO: 'gestao', ORDEM_SVO: 'gestao' },
  GESTOR_FROTA: { SOLICITACAO_VIAGEM: 'gestao', VIAGEM_FROTA: 'gestao' },
  // Administrativo: só o que ele mesmo pediu. SVO: exige a associação à unidade (notificacaoService)
  GESTOR_SVO: { SOLICITACAO_VIAGEM: 'solicitante', VIAGEM_FROTA: 'solicitante', SOLICITACAO_SVO: 'gestao', ORDEM_SVO: 'gestao' },
  SOLICITANTE: { SOLICITACAO_VIAGEM: 'solicitante', VIAGEM_FROTA: 'solicitante' },
  MOTORISTA_FROTA: { VIAGEM_FROTA: 'condutor' },
  MOTORISTA_SVO: { ORDEM_SVO: 'condutor' },
  INTEGRANTE_SVO: { ORDEM_SVO: 'designado' },
};
