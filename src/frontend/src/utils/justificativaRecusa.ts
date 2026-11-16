/** Limites das justificativas nas APIs administrativa e SVO, respectivamente. */
export const MAX_JUSTIFICATIVA_RECUSA = 200;
export const MAX_JUSTIFICATIVA_RECUSA_SVO = 500;

/** Mensagem de erro da justificativa, ou `null` se estiver válida (o texto é usado sem espaços nas pontas). */
export function erroDaJustificativa(texto: string, limite = MAX_JUSTIFICATIVA_RECUSA): string | null {
  const limpo = texto.trim();
  if (!limpo) return 'Informe a justificativa da recusa.';
  if (limpo.length > limite) {
    return `A justificativa da recusa deve conter no máximo ${limite} caracteres.`;
  }
  return null;
}
