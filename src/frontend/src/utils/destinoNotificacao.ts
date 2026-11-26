import { PERFIS } from '../types/usuario';
import type { Perfil } from '../types/usuario';
import { perfilPode } from './permissoes';
import type { Permissao } from './permissoes';

const ORIGEM_LOCAL_FICTICIA = 'https://frota.fsph.local';

/**
 * Permissões exigidas por rota interna exata realmente existente em `src/frontend/src/routes/index.tsx`.
 * Subpaths inexistentes (ex.: `/viagens/123`) são rejeitados para evitar 404.
 */
const PERMISSAO_POR_ROTA: Record<string, Permissao> = {
  '/minhas-coletas': 'coletasProprias.acessar',
  '/solicitacoes': 'solicitacoes.acessar',
  '/triagem-svo': 'triagemSvo.acessar',
  '/viagens': 'viagens.acessar',
  '/agenda': 'agenda.acessar',
  '/veiculos': 'veiculos.acessar',
  '/abastecimento': 'abastecimentos.acessar',
  '/manutencoes': 'manutencoes.acessar',
  '/multas': 'multas.acessar',
  '/equipe': 'equipe.acessar',
  '/motoristas': 'equipe.acessar',
  '/usuarios': 'usuarios.gerenciar',
  '/auditoria': 'auditoria.acessar',
};

const ROTAS_LIVRES_AUTENTICADO = new Set(['/', '/inicio', '/dashboard', '/sobre']);

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

/**
 * Verifica se o `pathname` corresponde exatamente a uma rota existente em `routes/index.tsx`
 * e se o perfil informado tem permissão para acessá-la.
 */
export function perfilPodeAcessarRota(perfil: Perfil | null | undefined, pathname: string): boolean {
  const caminhoNormalizado = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (perfil === PERFIS.INTEGRANTE_SVO) {
    return caminhoNormalizado === '/minhas-coletas' || caminhoNormalizado === '/sobre';
  }

  if (ROTAS_LIVRES_AUTENTICADO.has(caminhoNormalizado)) {
    return true;
  }

  const permissao = PERMISSAO_POR_ROTA[caminhoNormalizado];
  if (!permissao) return false;

  return perfilPode(perfil, permissao);
}

export interface DestinoNotificacaoResolvido {
  url: string;
  usouFallback: boolean;
}

/**
 * Resolve o destino final de uma notificação garantindo segurança de URL interna,
 * existência real da rota e aderência ao RBAC do perfil atual.
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
