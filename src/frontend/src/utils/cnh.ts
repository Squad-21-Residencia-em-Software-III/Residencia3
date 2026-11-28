/**
 * Espelho das regras do servidor (src/backend/src/constants/cnh.ts, SCRUM-308). Quem decide continua
 * sendo o servidor; aqui o erro só aparece antes, no campo. Não há dígito verificador: a Resolução
 * CONTRAN 1.020/2025 (art. 10, I) define a composição, mas não o algoritmo.
 */
export const CATEGORIAS_CNH_APROVADAS = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export const LETRAS_CATEGORIA_CNH = ['A', 'B', 'C', 'D', 'E'] as const;
export const VALIDADE_CNH_MINIMA = '2000-01-01';
export const VALIDADE_CNH_MAXIMA = '2099-12-31';

export function normalizarCnh(valor: string): string {
  return valor.trim().replace(/[\s.-]/g, '');
}

export function erroNumeroCnh(valor: string): string | null {
  const canonico = normalizarCnh(valor);
  if (!canonico) return 'Informe o número da CNH.';
  if (!/^\d{11}$/.test(canonico)) return 'A CNH deve conter 11 dígitos (pontos, hífens e espaços são ignorados).';
  if (/^(\d)\1+$/.test(canonico)) return 'Número de CNH inválido.';
  return null;
}

/** Junta as letras marcadas na string ordenada gravada no banco (ex.: A + D → "AD"). */
export function combinarCategorias(letras: readonly string[]): string {
  return [...letras].sort().join('');
}

export function erroCategoriaCnh(categoria: string): string | null {
  if (!categoria) return 'Selecione ao menos uma categoria.';
  return (CATEGORIAS_CNH_APROVADAS as readonly string[]).includes(categoria)
    ? null
    : `Combinação não aprovada. Use: ${CATEGORIAS_CNH_APROVADAS.join(', ')}.`;
}

export function dataCivilValida(valor: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  return dia <= [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

export function erroValidadeCnh(valor: string): string | null {
  if (!valor) return 'Informe a validade da CNH.';
  if (!dataCivilValida(valor)) return 'Data de validade inválida.';
  if (valor < VALIDADE_CNH_MINIMA || valor > VALIDADE_CNH_MAXIMA) {
    return 'A validade deve estar entre 01/01/2000 e 31/12/2099.';
  }
  return null;
}

/** Hoje (data civil) no fuso de São Paulo, para comparar com a validade sem timestamp. */
export function hojeCivil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

export function cnhVencida(validade: string, hoje: string = hojeCivil()): boolean {
  return validade < hoje;
}

export function mascararCnh(finais: string): string {
  return `•••••••${finais}`;
}
