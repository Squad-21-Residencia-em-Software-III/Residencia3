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

  /** Endpoint leve para polling econômico do badge de não lidas. */
  contador() {
    return request<RespostaContadorNotificacoes>('GET', '/notificacoes/contador');
  },

  /** Marca uma notificação específica como lida. */
  marcarLida(id: number) {
    return request<RespostaMarcarLida>('PATCH', `/notificacoes/${id}/lida`);
  },

  /** Marca todas as notificações não lidas do usuário como lidas. */
  marcarTodasLidas() {
    return request<RespostaMarcarLida>('PATCH', '/notificacoes/ler-todas');
  },

  /** Marca como lidas todas as notificações ligadas à mesma entidade de negócio. */
  marcarReferenciaLida(referencia_tipo: string, referencia_id: number) {
    return request<RespostaMarcarLida>('PATCH', '/notificacoes/referencia/lida', {
      body: { referencia_tipo, referencia_id },
    });
  },
};
