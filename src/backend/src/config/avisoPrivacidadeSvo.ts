// Versões do aviso de privacidade do portal SVO aceitas na criação da solicitação externa (SCRUM-264).
// A lista oficial é definida pela instituição; por isso vem de AVISO_PRIVACIDADE_SVO_VERSOES
// (versões separadas por vírgula). Sem a variável, só o formato é validado (sem espaços nem controle),
// e a configuração passa a ser pré-requisito da homologação institucional (docs/scrum-264-endpoint-publico-svo.md).
const FORMATO_VERSAO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export function versoesAvisoPrivacidadeSvo(origem: NodeJS.ProcessEnv = process.env): string[] | null {
  const bruto = origem.AVISO_PRIVACIDADE_SVO_VERSOES?.trim();
  if (!bruto) return null;
  const versoes = bruto.split(',').map((versao) => versao.trim()).filter(Boolean);
  const invalida = versoes.find((versao) => !FORMATO_VERSAO.test(versao));
  if (versoes.length === 0 || invalida !== undefined) {
    throw new Error('AVISO_PRIVACIDADE_SVO_VERSOES deve listar versões válidas separadas por vírgula');
  }
  return versoes;
}

export function versaoAvisoPrivacidadeReconhecida(
  versao: string,
  reconhecidas: string[] | null = versoesAvisoPrivacidadeSvo(),
): boolean {
  return reconhecidas === null ? FORMATO_VERSAO.test(versao) : reconhecidas.includes(versao);
}
