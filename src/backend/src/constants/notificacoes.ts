/**
 * Tipo do registro de origem. Administrativo e SVO têm tipos próprios: com o mesmo id, um nunca é
 * confundido com o outro.
 */
export const REFERENCIAS_NOTIFICACAO = {
  SOLICITACAO: 'SOLICITACAO',
} as const;

/** Mesmos códigos de `preferencias_notificacao.categoria`. */
export const CATEGORIAS_NOTIFICACAO = {
  SOLICITACOES: 'SOLICITACOES',
} as const;
