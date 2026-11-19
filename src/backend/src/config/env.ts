import { isIP } from 'node:net';
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
// Sub-redes nomeadas aceitas pelo Express em "trust proxy"
const PRESETS_PROXY = ['loopback', 'linklocal', 'uniquelocal'];

function obrigatoria(origem: Origem, nome: string): string {
  const valor = origem[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${nome}`);
  }
  return valor;
}

// As mensagens nunca incluem o valor do segredo
function validarSegredo(segredo: string, nome = 'JWT_SECRET'): string {
  if (segredo.length < TAMANHO_MINIMO_SEGREDO) {
    throw new Error(`${nome} deve ter pelo menos ${TAMANHO_MINIMO_SEGREDO} caracteres`);
  }
  if (SEGREDOS_DE_EXEMPLO.includes(segredo)) {
    throw new Error(`${nome} não pode usar o valor de exemplo da documentação`);
  }
  if (new Set(segredo).size < CARACTERES_DISTINTOS_MINIMOS) {
    throw new Error(`${nome} é previsível demais; gere um valor aleatório`);
  }
  return segredo;
}

// Segredo opcional: ausente ou vazio desativa o recurso; definido, segue as mesmas regras do JWT_SECRET
function segredoOpcional(origem: Origem, nome: string): string | undefined {
  const valor = origem[nome];
  if (valor === undefined || valor === '') return undefined;
  return validarSegredo(valor, nome);
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
    if (producao && url.protocol !== 'https:') {
      throw new Error('CORS_ORIGIN deve usar apenas origens https em produção');
    }
  }
  return itens;
}

// Endereço IP ou faixa CIDR de um proxy confiável. Faixas que cobrem toda a internet
// (prefixo /0) equivalem a confiar em qualquer cliente e são recusadas.
function enderecoDeProxyValido(item: string): boolean {
  if (PRESETS_PROXY.includes(item)) return true;
  const [ip, prefixo, ...resto] = item.split('/');
  const versao = isIP(ip ?? '');
  if (!versao || resto.length > 0) return false;
  if (prefixo === undefined) return true;
  const bits = Number(prefixo);
  return /^\d+$/.test(prefixo) && bits >= 1 && bits <= (versao === 4 ? 32 : 128);
}

// Proxies reversos à frente da API (ex.: Vercel → Render), usados pelo Express para obter o
// IP real do cliente (req.ip) a partir do X-Forwarded-For. Aceita:
// - número de saltos confiáveis (0 a 10), contado a partir da API;
// - lista de IPs/CIDRs dos proxies (ou loopback, linklocal, uniquelocal).
// "true" (confiar em qualquer proxy) é recusado: permitiria a qualquer cliente forjar o IP.
// Em produção é obrigatório, para que a cadeia real seja declarada, e não presumida.
// Nenhum proxy confiável é representado por false (e não 0): é o valor que o express-rate-limit
// reconhece para acusar X-Forwarded-For inesperado (TRUST_PROXY ausente atrás de um proxy).
function confiancaProxy(valor: string | undefined, producao: boolean): false | number | string[] {
  if (valor === undefined || valor.trim() === '') {
    if (producao) {
      throw new Error('TRUST_PROXY é obrigatório em produção: informe os saltos ou os IPs/CIDRs dos proxies');
    }
    return false;
  }
  const texto = valor.trim();
  if (/^\d+$/.test(texto)) {
    if (Number(texto) > MAXIMO_SALTOS_PROXY) {
      throw new Error(`TRUST_PROXY deve ter no máximo ${MAXIMO_SALTOS_PROXY} saltos`);
    }
    return Number(texto) === 0 ? false : Number(texto);
  }
  const itens = texto.split(',').map((item) => item.trim()).filter(Boolean);
  if (itens.length === 0 || !itens.every(enderecoDeProxyValido)) {
    throw new Error(
      'TRUST_PROXY deve ser um número de saltos ou uma lista de IPs/CIDRs (ou loopback, linklocal, uniquelocal); "true" e faixas /0 não são permitidos'
    );
  }
  return itens;
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

// Inteiro configurável dentro de uma faixa segura (limites de requisição e tempos)
function inteiroNaFaixa(nome: string, valor: string | undefined, padrao: number, minimo: number, maximo: number): number {
  if (valor === undefined || valor.trim() === '') return padrao;
  const numero = Number(valor.trim());
  if (!/^\d+$/.test(valor.trim()) || numero < minimo || numero > maximo) {
    throw new Error(`${nome} deve ser um número inteiro entre ${minimo} e ${maximo}`);
  }
  return numero;
}

// Limites gerais de requisição (docs/limites-e-timeouts.md). Ficam desligados por padrão só nos
// testes automatizados; em produção não podem ser desligados.
function limitesAtivos(valor: string | undefined, nodeEnv: string, producao: boolean): boolean {
  if (valor === undefined || valor === '') return nodeEnv !== 'test';
  if (valor !== 'on' && valor !== 'off') {
    throw new Error('RATE_LIMIT deve ser on ou off');
  }
  if (producao && valor === 'off') {
    throw new Error('RATE_LIMIT não pode ser desligado em produção');
  }
  return valor === 'on';
}

// Fotos do odômetro (SCRUM-208/209, docs/evidencias-odometro.md).
// desativado: as rotas de foto respondem 503 e iniciar/finalizar funcionam como antes.
// local: arquivos numa pasta do servidor (desenvolvimento, testes ou disco persistente montado).
const DRIVERS_ARMAZENAMENTO_EVIDENCIAS = ['desativado', 'local', 'postgres'] as const;
export type DriverArmazenamentoEvidencias = (typeof DRIVERS_ARMAZENAMENTO_EVIDENCIAS)[number];

function configuracaoEvidenciasOdometro(origem: Origem, nodeEnv: string) {
  const valor = (origem.EVIDENCIAS_STORAGE ?? '').trim() || 'desativado';
  if (!(DRIVERS_ARMAZENAMENTO_EVIDENCIAS as readonly string[]).includes(valor)) {
    throw new Error(`EVIDENCIAS_STORAGE deve ser um destes: ${DRIVERS_ARMAZENAMENTO_EVIDENCIAS.join(', ')}`);
  }
  const driver = valor as DriverArmazenamentoEvidencias;
  const pasta = (origem.EVIDENCIAS_STORAGE_DIR ?? '').trim();
  // Em produção a pasta precisa ser declarada e absoluta: o disco padrão do Render é apagado a cada deploy
  if (driver === 'local' && nodeEnv === 'production' && !path.isAbsolute(pasta)) {
    throw new Error('Com EVIDENCIAS_STORAGE=local em produção, EVIDENCIAS_STORAGE_DIR deve ser o caminho absoluto de um disco persistente');
  }
  const obrigatorias = (origem.FOTOS_ODOMETRO_OBRIGATORIAS ?? '').trim() || 'false';
  if (obrigatorias !== 'true' && obrigatorias !== 'false') {
    throw new Error('FOTOS_ODOMETRO_OBRIGATORIAS deve ser true ou false');
  }
  if (obrigatorias === 'true' && driver === 'desativado') {
    throw new Error('FOTOS_ODOMETRO_OBRIGATORIAS=true exige EVIDENCIAS_STORAGE configurado');
  }
  return {
    evidenciasStorage: driver,
    evidenciasStorageDir: path.resolve(pasta || path.join(__dirname, '../../storage/evidencias')),
    evidenciasPostgresLimiteBytes:
      inteiroNaFaixa('EVIDENCIAS_POSTGRES_LIMITE_MIB', origem.EVIDENCIAS_POSTGRES_LIMITE_MIB, 128, 1, 512) * 1024 * 1024,
    fotosOdometroObrigatorias: obrigatorias === 'true',
  };
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
    producao,
    port: Number(origem.PORT) || 3000,
    jwtSecret: validarSegredo(obrigatoria(origem, 'JWT_SECRET')),
    jwtExpiresIn,
    jwtExpiraEmSegundos,
    jwtRefreshExpiresIn,
    jwtRefreshExpiraEmSegundos,
    corsOrigens: origensCors(origem.CORS_ORIGIN, producao),
    trustProxy: confiancaProxy(origem.TRUST_PROXY, producao),
    // Enviado pela Vercel no rewrite /api (docs/seguranca-http.md): identifica o caminho via proxy
    proxySecret: segredoOpcional(origem, 'PROXY_SECRET'),
    // Liga a rota /api/diagnostico/ip, usada só para validar a cadeia de proxies
    diagnosticoProxyToken: segredoOpcional(origem, 'DIAGNOSTICO_PROXY_TOKEN'),
    cookieSecure: cookieSeguro(origem.COOKIE_SECURE, producao),
    limitarRequisicoes: limitesAtivos(origem.RATE_LIMIT, nodeEnv, producao),
    rateLimitLeituraPorMin: inteiroNaFaixa('RATE_LIMIT_LEITURA_POR_MIN', origem.RATE_LIMIT_LEITURA_POR_MIN, 300, 10, 10000),
    rateLimitEscritaPorMin: inteiroNaFaixa('RATE_LIMIT_ESCRITA_POR_MIN', origem.RATE_LIMIT_ESCRITA_POR_MIN, 60, 5, 5000),
    rateLimitPesadasPorMin: inteiroNaFaixa('RATE_LIMIT_PESADAS_POR_MIN', origem.RATE_LIMIT_PESADAS_POR_MIN, 30, 1, 1000),
    maxRequisicoesSimultaneas: inteiroNaFaixa('MAX_REQUISICOES_SIMULTANEAS', origem.MAX_REQUISICOES_SIMULTANEAS, 50, 1, 1000),
    requestTimeoutMs: inteiroNaFaixa('REQUEST_TIMEOUT_MS', origem.REQUEST_TIMEOUT_MS, 15000, 1000, 120000),
    ...configuracaoEvidenciasOdometro(origem, nodeEnv),
  };
}

export const env = carregarEnv();
