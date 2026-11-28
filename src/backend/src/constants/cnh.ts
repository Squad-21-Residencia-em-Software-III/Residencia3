/**
 * Regras estruturais da CNH (SCRUM-308, docs/scrum-308-cadastro-cnh.md).
 *
 * O art. 10, inciso I, da Resolução CONTRAN 1.020/2025 descreve o Registro Nacional como nove
 * caracteres e dois dígitos verificadores, mas não define o algoritmo de cálculo. Por isso esta
 * validação é só estrutural (11 dígitos) e NÃO confere dígitos verificadores. Uma verificação de
 * DV só pode entrar com a especificação oficial vigente e exemplos confiáveis registrados no PR.
 */

/** Separadores aceitos na digitação. Só eles são removidos na normalização. */
export const SEPARADORES_CNH = /[\s.-]/g;

/**
 * Mesma expressão do índice único `uq_motoristas_numero_cnh_canonico`. Sem prefixo de tabela, a
 * consulta pode usar o índice.
 */
export function sqlCnhCanonica(coluna = 'numero_cnh'): string {
  return `regexp_replace(${coluna}, '[[:space:].-]', '', 'g')`;
}

export const TAMANHO_CNH = 11;

/**
 * Combinações de categoria aprovadas para a frota (string ordenada, como gravada em
 * `motoristas.categoria_cnh`). ACC fica de fora porque não habilita veículos da frota.
 * Lista pendente de confirmação institucional; altere aqui e em src/frontend/src/utils/cnh.ts.
 */
export const CATEGORIAS_CNH_APROVADAS = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export type CategoriaCnh = (typeof CATEGORIAS_CNH_APROVADAS)[number];

/** Limites aceitos para a validade (datas civis, sem fuso). */
export const VALIDADE_CNH_MINIMA = '2000-01-01';
export const VALIDADE_CNH_MAXIMA = '2099-12-31';

export function normalizarCnh(valor: string): string {
  return valor.trim().replace(SEPARADORES_CNH, '');
}

export type ProblemaCnh = 'FORMATO' | 'MANIFESTAMENTE_INVALIDO';

/** Valida a estrutura de um número já normalizado. Não confere dígitos verificadores. */
export function validarEstruturaCnh(canonico: string): ProblemaCnh | null {
  if (!new RegExp(`^\\d{${TAMANHO_CNH}}$`).test(canonico)) return 'FORMATO';
  if (/^(\d)\1+$/.test(canonico)) return 'MANIFESTAMENTE_INVALIDO';
  return null;
}

function anoBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/** Data civil estrita AAAA-MM-DD, sem conversão para Date (evita rolagem e fuso). */
export function dataCivilValida(valor: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const diasNoMes = [31, anoBissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return dia <= diasNoMes;
}

/** Hoje no fuso do serviço (America/Sao_Paulo), em AAAA-MM-DD. */
export function hojeCivil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

export function cnhVencida(validade: string, hoje: string = hojeCivil()): boolean {
  return validade < hoje;
}

export function mascararCnh(finais: string): string {
  return `•••••••${finais}`;
}
