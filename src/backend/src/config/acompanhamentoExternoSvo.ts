/**
 * Controle de ativacao independente do acompanhamento externo de solicitacoes SVO (SCRUM-266 / SCRUM-296).
 * Permanece desligado por padrao (false) ate ativacao explicita via FASE3_ACOMPANHAMENTO_EXTERNO=true.
 * A consulta publica pode ser mantida ativa separadamente do formulario de cadastro (FASE3_PORTAL_SVO).
 */
export function acompanharExternoAtivo(
  origem: Record<string, string | undefined> = process.env
): boolean {
  return origem.FASE3_ACOMPANHAMENTO_EXTERNO === 'true';
}
