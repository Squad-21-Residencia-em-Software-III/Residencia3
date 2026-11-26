import { request } from './http';

/** Categoria de aviso que o perfil do usuário pode receber. A lista e os textos vêm da API. */
export interface CategoriaNotificacao {
  codigo: string;
  titulo: string;
  descricao?: string | null;
  push: boolean;
}

export interface AssinaturaPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Alertas no aparelho (SCRUM-238). Só é usado com o interruptor `webPush` ligado.
 * Contrato: docs/scrum-238-contrato-push.md.
 */
export const notificacoesPushApi = {
  chavePublica: (signal?: AbortSignal) =>
    request<{ publicKey: string }>('GET', '/notificacoes/vapid-public-key', { signal }),

  /** Idempotente: repetir a mesma assinatura do mesmo usuário não cria outra. */
  assinar: ({ endpoint, keys }: AssinaturaPush, signal?: AbortSignal) =>
    request<void>('POST', '/notificacoes/subscribe', { body: { endpoint, keys }, signal }),

  /** `token`: da sessão que está acabando, quando o token já foi limpo da memória. */
  cancelar: (endpoint: string, opcoes: { token?: string; signal?: AbortSignal } = {}) =>
    request<void>('DELETE', '/notificacoes/unsubscribe', { body: { endpoint }, ...opcoes }),

  /** Informa a assinatura ativa da sessão e seu vínculo opaco. O endereço vai no corpo da requisição. */
  situacao: (endpoint: string, signal?: AbortSignal) =>
    request<{ ativa: boolean; vinculo?: string }>('POST', '/notificacoes/subscribe/status', { body: { endpoint }, signal }),

  preferencias: () =>
    request<{ categorias: CategoriaNotificacao[] }>('GET', '/notificacoes/preferencias'),

  salvarPreferencia: (codigo: string, push: boolean) =>
    request<CategoriaNotificacao>('PATCH', `/notificacoes/preferencias/${encodeURIComponent(codigo)}`, {
      body: { push },
    }),
};
