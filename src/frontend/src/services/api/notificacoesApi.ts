import { request } from './http';
import type {
  RespostaContadorNotificacoes,
  RespostaListaNotificacoes,
  RespostaMarcarLida,
} from '../../types/notificacao';

export interface ListarNotificacoesParams {
  limit?: number;
  cursor?: string | null;
  apenasNaoLidas?: boolean;
}

export const notificacoesApi = {
  /** Lista notificações do usuário autenticado ordenadas da mais recente para a mais antiga. */
  listar({ limit = 20, cursor, apenasNaoLidas }: ListarNotificacoesParams = {}) {
    return request<RespostaListaNotificacoes>('GET', '/notificacoes', {
      query: {
        limit,
        cursor: cursor ?? undefined,
        apenas_nao_lidas: apenasNaoLidas ? true : undefined,
      },
    });
  },

  /** Endpoint leve para polling econômico do badge de não lidas e versão de sincronização. */
  contador() {
    return request<RespostaContadorNotificacoes>('GET', '/notificacoes/contador');
  },

  /** Marca uma notificação específica como lida. */
  marcarLida(id: number) {
    return request<RespostaMarcarLida>('PATCH', `/notificacoes/${id}/lida`);
  },

  /** Marca apenas os avisos já apresentados na central. */
  marcarTodasLidas(ids: number[]) {
    return request<RespostaMarcarLida>('PATCH', '/notificacoes/ler-todas', { body: { ids } });
  },

  /** Marca como lidas todas as notificações ligadas à mesma entidade de negócio. */
  marcarReferenciaLida(referencia_tipo: string, referencia_id: number) {
    return request<RespostaMarcarLida>('PATCH', '/notificacoes/referencia/lida', {
      body: { referencia_tipo, referencia_id },
    });
  },
};
