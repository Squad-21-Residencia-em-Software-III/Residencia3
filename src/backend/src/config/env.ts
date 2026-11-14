import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

type Origem = Record<string, string | undefined>;

// HS256 exige segredo de pelo menos 256 bits; 32 caracteres é o mínimo aceito
export const TAMANHO_MINIMO_SEGREDO = 32;
const CARACTERES_DISTINTOS_MINIMOS = 10;

// Valores de exemplo da documentação, que nunca podem ser usados como segredo real
const SEGREDOS_DE_EXEMPLO = [
  'troque_por_um_segredo_longo_e_aleatorio',
  'um_segredo_longo_e_aleatorio',
];

// Limites da política de sessão (ver docs/seguranca-sessoes.md)
const MAXIMO_ACCESS_SEGUNDOS = 8 * 60 * 60;
const MAXIMO_REFRESH_SEGUNDOS = 24 * 60 * 60;

const UNIDADES: Record<string, number> = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 };

// Origem do frontend no desenvolvimento local (Vite)
const CORS_ORIGIN_PADRAO_DEV = 'http://localhost:5173';
const MAXIMO_SALTOS_PROXY = 10;

function obrigatoria(origem: Origem, nome: string): string {
  const valor = origem[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${nome}`);
  }
  return valor;
}

// As mensagens nunca incluem o valor do segredo
function validarSegredo(segredo: string): string {
  if (segredo.length < TAMANHO_MINIMO_SEGREDO) {
    throw new Error(`JWT_SECRET deve ter pelo menos ${TAMANHO_MINIMO_SEGREDO} caracteres`);
  }
  if (SEGREDOS_DE_EXEMPLO.includes(segredo)) {
    throw new Error('JWT_SECRET não pode usar o valor de exemplo da documentação');
  }
  if (new Set(segredo).size < CARACTERES_DISTINTOS_MINIMOS) {
    throw new Error('JWT_SECRET é previsível demais; gere um valor aleatório');
  }
  return segredo;
}

// Converte durações como "30m", "2h" ou "1d" em segundos
export function duracaoEmSegundos(nome: string, valor: string, maximo: number): number {
  const partes = /^(\d+)([smhd])$/.exec(valor);
  if (!partes) {
    throw new Error(`${nome} deve seguir o formato <número><s|m|h|d>, por exemplo 2h`);
  }
  const segundos = Number(partes[1]) * UNIDADES[partes[2]!]!;
  if (segundos <= 0 || segundos > maximo) {
    throw new Error(`${nome} deve ser maior que zero e no máximo ${maximo / 3600}h`);
  }
  return segundos;
}

// Lista de origens (esquema://host[:porta]) autorizadas a chamar a API com credenciais.
// O curinga "*" é proibido: com cookies, a origem precisa ser explícita.
function origensCors(valor: string | undefined, producao: boolean): string[] {
  if (valor === undefined) return producao ? [] : [CORS_ORIGIN_PADRAO_DEV];
  const itens = valor.split(',').map((item) => item.trim()).filter(Boolean);
  for (const item of itens) {
    let url: URL | undefined;
    try {
      url = new URL(item);
    } catch {
      url = undefined;
    }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.origin !== item) {
      throw new Error('CORS_ORIGIN deve conter apenas origens no formato https://dominio[:porta], separadas por vírgula');
    }
  }
  return itens;
}

// Quantidade de proxies reversos à frente da API (Render, Vercel), usada para obter o IP real
function saltosDeProxy(valor: string | undefined): number {
  if (valor === undefined || valor === '') return 0;
  if (!/^\d+$/.test(valor) || Number(valor) > MAXIMO_SALTOS_PROXY) {
    throw new Error(`TRUST_PROXY deve ser um número inteiro de 0 a ${MAXIMO_SALTOS_PROXY}`);
  }
  return Number(valor);
}

// Cookies de sessão exigem HTTPS em produção; COOKIE_SECURE=false só é aceito fora dela
function cookieSeguro(valor: string | undefined, producao: boolean): boolean {
  if (valor === undefined || valor === '') return producao;
  if (valor !== 'true' && valor !== 'false') {
    throw new Error('COOKIE_SECURE deve ser true ou false');
  }
  if (producao && valor === 'false') {
    throw new Error('COOKIE_SECURE não pode ser false em produção');
  }
  return valor === 'true';
}

export function carregarEnv(origem: Origem = process.env) {
  const nodeEnv = origem.NODE_ENV ?? 'development';
  const producao = nodeEnv === 'production';
  const jwtExpiresIn = origem.JWT_EXPIRES_IN ?? '2h';
  const jwtRefreshExpiresIn = origem.JWT_REFRESH_EXPIRES_IN ?? '12h';
  const jwtExpiraEmSegundos = duracaoEmSegundos('JWT_EXPIRES_IN', jwtExpiresIn, MAXIMO_ACCESS_SEGUNDOS);
  const jwtRefreshExpiraEmSegundos = duracaoEmSegundos(
    'JWT_REFRESH_EXPIRES_IN',
    jwtRefreshExpiresIn,
    MAXIMO_REFRESH_SEGUNDOS
  );
  if (jwtRefreshExpiraEmSegundos <= jwtExpiraEmSegundos) {
    throw new Error('JWT_REFRESH_EXPIRES_IN deve ser maior que JWT_EXPIRES_IN');
  }

  return {
    nodeEnv,
    port: Number(origem.PORT) || 3000,
    jwtSecret: validarSegredo(obrigatoria(origem, 'JWT_SECRET')),
    jwtExpiresIn,
    jwtExpiraEmSegundos,
    jwtRefreshExpiresIn,
    jwtRefreshExpiraEmSegundos,
    corsOrigens: origensCors(origem.CORS_ORIGIN, producao),
    trustProxy: saltosDeProxy(origem.TRUST_PROXY),
    cookieSecure: cookieSeguro(origem.COOKIE_SECURE, producao),
  };
}

export const env = carregarEnv();
