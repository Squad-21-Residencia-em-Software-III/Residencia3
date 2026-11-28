import { LIMITES_SERGIPE, type CoordenadaMapa } from '../config/mapas';
import type { EnderecoMapa, UnidadeInstitucional } from '../types/mapa';

export interface DefinicaoUnidadeInstitucional {
  codigo: UnidadeInstitucional;
  rotulo: string;
  nomeCompleto: string;
}

export const UNIDADES_INSTITUCIONAIS: readonly DefinicaoUnidadeInstitucional[] = [
  { codigo: 'HEMOSE', rotulo: 'HEMOSE', nomeCompleto: 'HEMOSE — Centro de Hemoterapia de Sergipe' },
  { codigo: 'SVO', rotulo: 'SVO', nomeCompleto: 'SVO — Serviço de Verificação de Óbitos' },
  {
    codigo: 'LACEN',
    rotulo: 'LACEN',
    nomeCompleto: 'LACEN — Laboratório Central de Saúde Pública',
  },
] as const;

const REGEX_CEP = /^\d{2}\.?\d{3}-?\d{3}$/;
const REGEX_ENTRADA_APENAS_CEP = /^[\d.-]+$/;
const REGEX_TERMO_SENSIVEL =
  /\b(?:cpf|rg|telefone|contato|paciente|diagnóstico|diagnostico|ocorrência|ocorrencia|prontuário|prontuario|senha|token)\b/iu;
const REGEX_SEQUENCIA_LONGA_DIGITOS = /\d(?:[ .()/-]*\d){8}/;
const REGEX_APENAS_DIGITOS = /^(?:\d[ -]*)+$/;
const REGEX_CARACTERES_PERMITIDOS = /^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'ºª()/-]*$/u;

export function arredondarCoordenada(valor: number): number {
  return Number(valor.toFixed(6));
}

export function extrairCepValido(entrada: string): string | null {
  const limpo = entrada.trim();
  if (!REGEX_CEP.test(limpo)) return null;
  return limpo.replace(/\D/g, '');
}

/**
 * Aplica máscara `XXXXX-XXX` enquanto o usuário digita apenas dígitos de CEP,
 * sem interferir quando há letras ou texto de endereço.
 */
export function aplicarMascaraCepSeAplicavel(entrada: string): string {
  const aparado = entrada.trim();
  if (!aparado || !REGEX_ENTRADA_APENAS_CEP.test(aparado)) return entrada;
  const digitos = aparado.replace(/\D/g, '');
  if (digitos.length <= 5 || digitos.length > 8) return entrada;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

export function formatarCep(cep: string): string {
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return cep;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

export function normalizarConsultaTexto(entrada: string): string {
  return entrada.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 120);
}

/**
 * Evita enviar termos de PII ou sequências numéricas longas (como CPF/telefone)
 * ao proxy de geocodificação, espelhando a validação de `mapasSchemas.ts`.
 */
export function consultaTextoValidaParaBusca(entrada: string): boolean {
  const texto = normalizarConsultaTexto(entrada);
  if (texto.length < 3 || texto.length > 120) return false;
  if (!REGEX_CARACTERES_PERMITIDOS.test(texto)) return false;
  if (REGEX_TERMO_SENSIVEL.test(texto)) return false;
  if (REGEX_SEQUENCIA_LONGA_DIGITOS.test(texto)) return false;
  if (REGEX_APENAS_DIGITOS.test(texto)) return false;
  return true;
}

export function coordenadaForaDeSergipe(coordenada: CoordenadaMapa): boolean {
  return (
    coordenada.latitude < LIMITES_SERGIPE.minLatitude ||
    coordenada.latitude > LIMITES_SERGIPE.maxLatitude ||
    coordenada.longitude < LIMITES_SERGIPE.minLongitude ||
    coordenada.longitude > LIMITES_SERGIPE.maxLongitude
  );
}

export function determinarForaDeSergipe(
  endereco: Pick<EnderecoMapa, 'foraDeSergipe' | 'coordenadas'>,
): boolean | null {
  if (typeof endereco.foraDeSergipe === 'boolean') return endereco.foraDeSergipe;
  if (endereco.coordenadas) return coordenadaForaDeSergipe(endereco.coordenadas);
  return null;
}

export function formatarEnderecoMapa(endereco: EnderecoMapa): string {
  const linhaLogradouro = [endereco.logradouro, endereco.numero].filter(Boolean).join(', ');
  const linhaLocalidade = [endereco.municipio, endereco.estado].filter(Boolean).join(' - ');
  const partes = [linhaLogradouro, endereco.bairro, linhaLocalidade].filter(Boolean);

  if (endereco.cep) {
    partes.push(`CEP ${formatarCep(endereco.cep)}`);
  }

  if (partes.length > 0) return partes.join(', ');

  if (endereco.coordenadas) {
    return `${arredondarCoordenada(endereco.coordenadas.latitude)}, ${arredondarCoordenada(endereco.coordenadas.longitude)}`;
  }

  return '';
}

export function coordenadasIguais(
  a: CoordenadaMapa | null | undefined,
  b: CoordenadaMapa | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    arredondarCoordenada(a.latitude) === arredondarCoordenada(b.latitude) &&
    arredondarCoordenada(a.longitude) === arredondarCoordenada(b.longitude)
  );
}
