/** Limite da justificativa de recusa, igual ao validado pela API (administrativa e SVO). */
export const MAX_JUSTIFICATIVA_RECUSA = 200;

/** Mensagem de erro da justificativa, ou `null` se estiver válida (o texto é usado sem espaços nas pontas). */
export function erroDaJustificativa(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) return 'Informe a justificativa da recusa.';
  if (limpo.length > MAX_JUSTIFICATIVA_RECUSA) {
    return `A justificativa da recusa deve conter no máximo ${MAX_JUSTIFICATIVA_RECUSA} caracteres.`;
  }
  return null;
}
