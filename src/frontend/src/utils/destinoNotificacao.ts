import { PERFIS } from '../types/usuario';
import type { Perfil } from '../types/usuario';
import { perfilPode } from './permissoes';
import type { Permissao } from './permissoes';

const ORIGEM_LOCAL_FICTICIA = 'https://frota.fsph.local';

/**
 * Permissões exigidas por prefixo de rota interna da aplicação.
 * Mantém alinhamento estrito com `src/frontend/src/routes/index.tsx` e `utils/permissoes.ts`.
 */
const PERMISSAO_POR_PREFIXO: Array<{ prefixo: string; permissao: Permissao }> = [
  { prefixo: '/minhas-coletas', permissao: 'coletasProprias.acessar' },
  { prefixo: '/solicitacoes', permissao: 'solicitacoes.acessar' },
  { prefixo: '/viagens', permissao: 'viagens.acessar' },
  { prefixo: '/agenda', permissao: 'agenda.acessar' },
  { prefixo: '/veiculos', permissao: 'veiculos.acessar' },
  { prefixo: '/abastecimento', permissao: 'abastecimentos.acessar' },
  { prefixo: '/manutencoes', permissao: 'manutencoes.acessar' },
  { prefixo: '/multas', permissao: 'multas.acessar' },
  { prefixo: '/equipe', permissao: 'equipe.acessar' },
  { prefixo: '/auditoria', permissao: 'auditoria.acessar' },
];

const ROTAS_LIVRES_AUTENTICADO = new Set(['/', '/inicio', '/sobre']);

/**
 * Valida se a URL de destino de uma notificação é uma rota interna segura:
 * - começa com `/` (nunca protocolo externo, `javascript:`, `data:` ou `//`);
 * - não contém `//`, `\`, espaços ou caracteres de controle;
 * - permanece na mesma origem após o parse.
 */
export function urlInternaSegura(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(url)) return null;
  if (url.includes('//')) return null;

  try {
    const parsed = new URL(url, ORIGEM_LOCAL_FICTICIA);
    if (parsed.origin !== ORIGEM_LOCAL_FICTICIA) return null;
    if (!parsed.pathname.startsWith('/')) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/** Rota inicial segura para cada perfil quando um deep link é inválido ou sem permissão. */
export function rotaFallbackDoPerfil(perfil: Perfil | null | undefined): string {
  switch (perfil) {
    case PERFIS.INTEGRANTE_SVO:
      return '/minhas-coletas';
    case PERFIS.SOLICITANTE:
      return '/solicitacoes';
    case PERFIS.MOTORISTA_FROTA:
    case PERFIS.MOTORISTA_SVO:
      return '/viagens';
    default:
      return '/inicio';
  }
}

/** Verifica se o perfil tem permissão para acessar o `pathname` informado. */
export function perfilPodeAcessarRota(perfil: Perfil | null | undefined, pathname: string): boolean {
  const caminhoNormalizado = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (perfil === PERFIS.INTEGRANTE_SVO) {
    return (
      caminhoNormalizado === '/minhas-coletas' ||
      caminhoNormalizado.startsWith('/minhas-coletas/') ||
      caminhoNormalizado === '/sobre'
    );
  }

  if (ROTAS_LIVRES_AUTENTICADO.has(caminhoNormalizado)) {
    return true;
  }

  for (const regra of PERMISSAO_POR_PREFIXO) {
    if (
      caminhoNormalizado === regra.prefixo ||
      caminhoNormalizado.startsWith(`${regra.prefixo}/`)
    ) {
      return perfilPode(perfil, regra.permissao);
    }
  }

  return false;
}

export interface DestinoNotificacaoResolvido {
  url: string;
  usouFallback: boolean;
}

/**
 * Resolve o destino final de uma notificação garantindo segurança de URL interna
 * e aderência ao RBAC do perfil atual (ex.: INTEGRANTE_SVO nunca cai em `/viagens`).
 */
export function resolverDestinoNotificacao(
  urlDestino: string | null | undefined,
  perfil: Perfil | null | undefined,
): DestinoNotificacaoResolvido {
  const segura = urlInternaSegura(urlDestino);
  if (!segura) {
    return { url: rotaFallbackDoPerfil(perfil), usouFallback: true };
  }

  const parsed = new URL(segura, ORIGEM_LOCAL_FICTICIA);
  if (!perfilPodeAcessarRota(perfil, parsed.pathname)) {
    return { url: rotaFallbackDoPerfil(perfil), usouFallback: true };
  }

  return { url: segura, usouFallback: false };
}
