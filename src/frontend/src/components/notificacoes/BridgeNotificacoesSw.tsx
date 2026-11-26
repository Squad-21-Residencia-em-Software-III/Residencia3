import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { recursoAtivo } from '../../config/recursosBackend';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificacoesOpcional } from '../../contexts/NotificacoesContext';
import { ApiError } from '../../services/api/http';
import { notificacoesApi } from '../../services/api/notificacoesApi';
import { lerEstadoPush } from '../../sw/estadoPush';
import { CHAVE_CLIQUE_PUSH, idNotificacao, lerReferenciaPush, TIPO_MSG_NAVEGAR_NOTIFICACAO } from '../../sw/logicaPushSw';
import { resolverDestinoNotificacao } from '../../utils/destinoNotificacao';
import { comLimite, sinalDaSessao } from '../../utils/operacoesPush';

function lerIntencao(texto: string | null): number | null {
  if (!texto || !/^\d{1,10}$/.test(texto)) return null;
  const id = Number(texto);
  return idNotificacao(id) ? id : null;
}

function salvarIntencao(id: number | null): void {
  try {
    if (id === null) sessionStorage.removeItem(CHAVE_CLIQUE_PUSH);
    else sessionStorage.setItem(CHAVE_CLIQUE_PUSH, String(id));
  } catch {
    // A referência ainda pode ser mantida em memória durante a navegação.
  }
}

function intencaoInicial(): number | null {
  try {
    return lerIntencao(new URLSearchParams(window.location.search).get('aviso')) ??
      lerIntencao(sessionStorage.getItem(CHAVE_CLIQUE_PUSH));
  } catch {
    return null;
  }
}

export function BridgeNotificacoesSw() {
  const navigate = useNavigate();
  const location = useLocation();
  const { usuario, carregando, versaoSessao } = useAuth();
  const ctx = useNotificacoesOpcional();
  const recursoHabilitado = ctx?.recursoHabilitado;
  const marcarLida = ctx?.marcarLida;
  const perfil = usuario?.perfil;
  const usuarioId = usuario?.id;
  const pendente = useRef<number | null>(intencaoInicial());
  const emConsulta = useRef<symbol | null>(null);

  useEffect(() => {
    const avisoNaUrl = lerIntencao(new URLSearchParams(location.search).get('aviso'));
    if (avisoNaUrl !== null) pendente.current = avisoNaUrl;
    if (pendente.current !== null) salvarIntencao(pendente.current);
  }, [location.search]);

  useEffect(() => {
    if (!recursoAtivo('webPush')) return;
    const sw = navigator.serviceWorker;
    let ativo = true;

    const resolver = async () => {
      const id = pendente.current;
      if (!perfil || carregando || !recursoHabilitado || id === null || emConsulta.current) return;
      const operacao = Symbol();
      const sinal = sinalDaSessao();
      const valido = () => ativo && !sinal.aborted && pendente.current === id;
      emConsulta.current = operacao;
      try {
        const item = await comLimite(sinal, (signal) => notificacoesApi.obter(id, signal));
        if (!valido() || item.id !== id || item.acesso_revogado) return;
        pendente.current = null;
        salvarIntencao(null);
        navigate(resolverDestinoNotificacao(item.url_destino, perfil).url, { replace: true });
        void marcarLida?.(id);
      } catch (erro) {
        if (valido() && erro instanceof ApiError && [400, 403, 404].includes(erro.status)) {
          pendente.current = null;
          salvarIntencao(null);
          navigate(resolverDestinoNotificacao(null, perfil).url, { replace: true });
        }
      } finally {
        if (emConsulta.current === operacao) {
          emConsulta.current = null;
          if (ativo && pendente.current !== null && pendente.current !== id) void resolver();
        }
      }
    };

    const aoReceber = async (evento: MessageEvent<unknown>) => {
      if (!sw?.controller || evento.source !== sw.controller || !evento.data ||
          typeof evento.data !== 'object' || !('tipo' in evento.data) ||
          evento.data.tipo !== TIPO_MSG_NAVEGAR_NOTIFICACAO) return;
      const referencia = lerReferenciaPush(evento.data);
      if (!referencia) return;
      const estado = await lerEstadoPush();
      if (!ativo || estado?.vinculo !== referencia.vinculo || estado.encerramento) return;
      pendente.current = referencia.notificacao_id;
      salvarIntencao(pendente.current);
      void resolver();
    };

    void resolver();
    sw?.addEventListener('message', aoReceber);
    window.addEventListener('online', resolver);
    window.addEventListener('focus', resolver);
    return () => {
      ativo = false;
      emConsulta.current = null;
      sw?.removeEventListener('message', aoReceber);
      window.removeEventListener('online', resolver);
      window.removeEventListener('focus', resolver);
    };
  }, [carregando, marcarLida, navigate, perfil, recursoHabilitado, usuarioId, versaoSessao]);

  return null;
}
