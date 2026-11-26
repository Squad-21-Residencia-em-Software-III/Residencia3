import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificacoesOpcional } from '../../contexts/NotificacoesContext';
import { TIPO_MSG_NAVEGAR_NOTIFICACAO } from '../../sw/logicaPushSw';
import { resolverDestinoNotificacao } from '../../utils/destinoNotificacao';

interface DadosMensagemNavegacao {
  tipo?: unknown;
  url?: unknown;
  notificacao_id?: unknown;
}

/**
 * Ouve mensagens de clique em notificação enviadas pelo Service Worker (`NAVEGAR_NOTIFICACAO`)
 * e navega pelo React Router validando destino interno e RBAC do perfil autenticado.
 */
export function BridgeNotificacoesSw() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const ctx = useNotificacoesOpcional();

  const perfil = usuario?.perfil ?? null;
  const marcarLida = ctx?.marcarLida;
  const podeMarcarLida = Boolean(ctx?.recursoHabilitado && ctx?.online);

  useEffect(() => {
    if (!perfil) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const sw = navigator.serviceWorker;
    if (!sw || typeof sw.addEventListener !== 'function') return;

    const aoReceberMensagem = (evento: MessageEvent<DadosMensagemNavegacao>) => {
      const dados = evento.data;
      if (!dados || dados.tipo !== TIPO_MSG_NAVEGAR_NOTIFICACAO) return;

      const urlRecebida = typeof dados.url === 'string' ? dados.url : null;
      const { url } = resolverDestinoNotificacao(urlRecebida, perfil);

      if (typeof dados.notificacao_id === 'number' && podeMarcarLida && marcarLida) {
        void marcarLida(dados.notificacao_id);
      }

      navigate(url);
    };

    sw.addEventListener('message', aoReceberMensagem);
    return () => {
      sw.removeEventListener('message', aoReceberMensagem);
    };
  }, [marcarLida, navigate, perfil, podeMarcarLida]);

  return null;
}
