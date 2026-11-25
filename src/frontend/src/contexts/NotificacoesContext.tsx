import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { recursoAtivo } from '../config/recursosBackend';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { mensagemDeErro } from '../services/api/http';
import { notificacoesApi } from '../services/api/notificacoesApi';
import type {
  NotificacaoInApp,
  PayloadNotificacaoPrimeiroPlano,
} from '../types/notificacao';
import { useAuth } from './AuthContext';

export const INTERVALO_POLLING_NOTIFICACOES_MS = 60_000;
export const DEBOUNCE_FOCO_NOTIFICACOES_MS = 5_000;
export const LIMITE_PAGINA_NOTIFICACOES = 20;

export interface NotificacoesContextValue {
  itens: NotificacaoInApp[];
  naoLidas: number;
  proximoCursor: string | null;
  carregando: boolean;
  carregandoMais: boolean;
  jaCarregouLista: boolean;
  erro: string | null;
  online: boolean;
  recursoHabilitado: boolean;
  toastAtivo: PayloadNotificacaoPrimeiroPlano | null;
  carregarLista: (opcoes?: { forcar?: boolean }) => Promise<void>;
  carregarMais: () => Promise<void>;
  atualizarContador: () => Promise<void>;
  marcarLida: (id: number) => Promise<void>;
  marcarTodasLidas: () => Promise<void>;
  marcarReferenciaLida: (referenciaTipo: string, referenciaId: number) => Promise<void>;
  notificarEmPrimeiroPlano: (payload: PayloadNotificacaoPrimeiroPlano) => void;
  fecharToast: () => void;
}

const NotificacoesContext = createContext<NotificacoesContextValue | null>(null);

function deduplicarPorId(lista: NotificacaoInApp[]): NotificacaoInApp[] {
  const vistos = new Set<number>();
  const resultado: NotificacaoInApp[] = [];
  for (const item of lista) {
    if (vistos.has(item.id)) continue;
    vistos.add(item.id);
    resultado.push(item);
  }
  return resultado;
}

interface NotificacoesProviderProps {
  children: ReactNode;
  /** Permite sobrescrever a feature flag em testes automatizados. */
  ativoOverride?: boolean;
}

export function NotificacoesProvider({ children, ativoOverride }: NotificacoesProviderProps) {
  const { usuario } = useAuth();
  const online = useOnlineStatus();
  const recursoHabilitado = ativoOverride ?? recursoAtivo('notificacoesInApp');

  const [itens, setItens] = useState<NotificacaoInApp[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [jaCarregouLista, setJaCarregouLista] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [toastAtivo, setToastAtivo] = useState<PayloadNotificacaoPrimeiroPlano | null>(null);

  const usuarioIdRef = useRef<number | null>(usuario?.id ?? null);
  const itensRef = useRef<NotificacaoInApp[]>(itens);
  itensRef.current = itens;
  const carregandoContadorRef = useRef(false);
  const carregandoListaRef = useRef(false);
  const ultimoSyncFocoRef = useRef(0);
  const idsToastExibidosRef = useRef<Set<string>>(new Set());

  // Limpa completamente o estado ao sair da conta ou trocar de usuário.
  useEffect(() => {
    const proximoId = usuario?.id ?? null;
    if (usuarioIdRef.current !== proximoId) {
      usuarioIdRef.current = proximoId;
      setItens([]);
      setNaoLidas(0);
      setProximoCursor(null);
      setCarregando(false);
      setCarregandoMais(false);
      setJaCarregouLista(false);
      setErro(null);
      setToastAtivo(null);
      carregandoContadorRef.current = false;
      carregandoListaRef.current = false;
      ultimoSyncFocoRef.current = 0;
      idsToastExibidosRef.current.clear();
    }
  }, [usuario?.id]);

  const atualizarContador = useCallback(async () => {
    const uid = usuario?.id ?? null;
    if (!recursoHabilitado || uid === null || !online || carregandoContadorRef.current) return;

    carregandoContadorRef.current = true;
    try {
      const resposta = await notificacoesApi.contador();
      if (usuarioIdRef.current !== uid) return;
      const total = typeof resposta?.nao_lidas === 'number' ? Math.max(0, resposta.nao_lidas) : 0;
      setNaoLidas(total);
    } catch {
      // Polling em segundo plano falha silenciosamente sem quebrar a interface.
    } finally {
      carregandoContadorRef.current = false;
    }
  }, [online, recursoHabilitado, usuario?.id]);

  // Polling econômico (60s) somente autenticado, online e com aba visível + revalidação em foco (debounce 5s).
  useEffect(() => {
    if (!recursoHabilitado || !usuario || !online) return;

    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void atualizarContador();
    }

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void atualizarContador();
      }
    }, INTERVALO_POLLING_NOTIFICACOES_MS);

    const revalidarComDebounce = () => {
      if (document.visibilityState !== 'visible') return;
      const agora = Date.now();
      if (agora - ultimoSyncFocoRef.current < DEBOUNCE_FOCO_NOTIFICACOES_MS) return;
      ultimoSyncFocoRef.current = agora;
      void atualizarContador();
    };

    window.addEventListener('focus', revalidarComDebounce);
    document.addEventListener('visibilitychange', revalidarComDebounce);

    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', revalidarComDebounce);
      document.removeEventListener('visibilitychange', revalidarComDebounce);
    };
  }, [atualizarContador, online, recursoHabilitado, usuario]);

  const carregarLista = useCallback(
    async (opcoes?: { forcar?: boolean }) => {
      const uid = usuario?.id ?? null;
      if (!recursoHabilitado || uid === null) {
        setJaCarregouLista(true);
        return;
      }
      if (!online) return;
      if (carregandoListaRef.current && !opcoes?.forcar) return;

      carregandoListaRef.current = true;
      setCarregando(true);
      setErro(null);
      try {
        const resposta = await notificacoesApi.listar({ limit: LIMITE_PAGINA_NOTIFICACOES });
        if (usuarioIdRef.current !== uid) return;
        const lista = Array.isArray(resposta?.itens) ? deduplicarPorId(resposta.itens) : [];
        setItens(lista);
        setProximoCursor(resposta?.proximo_cursor ?? null);
        if (typeof resposta?.nao_lidas === 'number') {
          setNaoLidas(Math.max(0, resposta.nao_lidas));
        }
        setJaCarregouLista(true);
      } catch (e) {
        if (usuarioIdRef.current !== uid) return;
        setErro(mensagemDeErro(e));
      } finally {
        carregandoListaRef.current = false;
        setCarregando(false);
      }
    },
    [online, recursoHabilitado, usuario?.id],
  );

  const carregarMais = useCallback(async () => {
    const uid = usuario?.id ?? null;
    if (!recursoHabilitado || uid === null || !online || !proximoCursor || carregandoMais) return;

    setCarregandoMais(true);
    setErro(null);
    try {
      const resposta = await notificacoesApi.listar({
        limit: LIMITE_PAGINA_NOTIFICACOES,
        cursor: proximoCursor,
      });
      if (usuarioIdRef.current !== uid) return;
      const novos = Array.isArray(resposta?.itens) ? resposta.itens : [];
      setItens((anterior) => deduplicarPorId([...anterior, ...novos]));
      setProximoCursor(resposta?.proximo_cursor ?? null);
      if (typeof resposta?.nao_lidas === 'number') {
        setNaoLidas(Math.max(0, resposta.nao_lidas));
      }
    } catch (e) {
      if (usuarioIdRef.current !== uid) return;
      setErro(mensagemDeErro(e));
    } finally {
      setCarregandoMais(false);
    }
  }, [carregandoMais, online, proximoCursor, recursoHabilitado, usuario?.id]);

  const marcarLida = useCallback(
    async (id: number) => {
      const uid = usuario?.id ?? null;
      if (!recursoHabilitado || uid === null || !online) return;

      const agora = new Date().toISOString();
      const alvo = itensRef.current.find((item) => item.id === id);
      const precisouAlterar = Boolean(alvo && alvo.lida_em === null);

      if (precisouAlterar) {
        setItens((anterior) =>
          anterior.map((item) =>
            item.id === id && item.lida_em === null ? { ...item, lida_em: agora } : item,
          ),
        );
        setNaoLidas((anterior) => Math.max(0, anterior - 1));
      }

      try {
        const resposta = await notificacoesApi.marcarLida(id);
        if (usuarioIdRef.current !== uid) return;
        if (typeof resposta?.nao_lidas === 'number') {
          setNaoLidas(Math.max(0, resposta.nao_lidas));
        }
      } catch {
        if (usuarioIdRef.current !== uid || !precisouAlterar) return;
        setItens((anterior) =>
          anterior.map((item) => (item.id === id ? { ...item, lida_em: null } : item)),
        );
        setNaoLidas((anterior) => anterior + 1);
      }
    },
    [online, recursoHabilitado, usuario?.id],
  );

  const marcarTodasLidas = useCallback(async () => {
    const uid = usuario?.id ?? null;
    if (!recursoHabilitado || uid === null || !online || naoLidas === 0) return;

    const agora = new Date().toISOString();
    const snapshotItens = itensRef.current;
    const snapshotNaoLidas = naoLidas;

    setItens((anterior) =>
      anterior.map((item) => (item.lida_em ? item : { ...item, lida_em: agora })),
    );
    setNaoLidas(0);

    try {
      await notificacoesApi.marcarTodasLidas();
    } catch (e) {
      if (usuarioIdRef.current !== uid) return;
      setItens(snapshotItens);
      setNaoLidas(snapshotNaoLidas);
      setErro(mensagemDeErro(e));
    }
  }, [naoLidas, online, recursoHabilitado, usuario?.id]);

  const marcarReferenciaLida = useCallback(
    async (referenciaTipo: string, referenciaId: number) => {
      const uid = usuario?.id ?? null;
      if (!recursoHabilitado || uid === null || !online) return;

      try {
        const resposta = await notificacoesApi.marcarReferenciaLida(referenciaTipo, referenciaId);
        if (usuarioIdRef.current !== uid) return;
        const agora = new Date().toISOString();
        let decremento = 0;
        setItens((anterior) =>
          anterior.map((item) => {
            if (
              item.referencia_tipo === referenciaTipo &&
              item.referencia_id === referenciaId &&
              item.lida_em === null
            ) {
              decremento += 1;
              return { ...item, lida_em: agora };
            }
            return item;
          }),
        );
        if (typeof resposta?.nao_lidas === 'number') {
          setNaoLidas(Math.max(0, resposta.nao_lidas));
        } else if (decremento > 0) {
          setNaoLidas((anterior) => Math.max(0, anterior - decremento));
        }
      } catch {
        // Leitura contextual por referência não deve bloquear a tela principal.
      }
    },
    [online, recursoHabilitado, usuario?.id],
  );

  const notificarEmPrimeiroPlano = useCallback(
    (payload: PayloadNotificacaoPrimeiroPlano) => {
      const chave = String(payload.id);
      if (idsToastExibidosRef.current.has(chave)) return;
      idsToastExibidosRef.current.add(chave);
      setToastAtivo(payload);
      if (recursoHabilitado && online && usuario) {
        void atualizarContador();
      }
    },
    [atualizarContador, online, recursoHabilitado, usuario],
  );

  const fecharToast = useCallback(() => {
    setToastAtivo(null);
  }, []);

  const valor = useMemo<NotificacoesContextValue>(
    () => ({
      itens,
      naoLidas,
      proximoCursor,
      carregando,
      carregandoMais,
      jaCarregouLista,
      erro,
      online,
      recursoHabilitado,
      toastAtivo,
      carregarLista,
      carregarMais,
      atualizarContador,
      marcarLida,
      marcarTodasLidas,
      marcarReferenciaLida,
      notificarEmPrimeiroPlano,
      fecharToast,
    }),
    [
      itens,
      naoLidas,
      proximoCursor,
      carregando,
      carregandoMais,
      jaCarregouLista,
      erro,
      online,
      recursoHabilitado,
      toastAtivo,
      carregarLista,
      carregarMais,
      atualizarContador,
      marcarLida,
      marcarTodasLidas,
      marcarReferenciaLida,
      notificarEmPrimeiroPlano,
      fecharToast,
    ],
  );

  return <NotificacoesContext.Provider value={valor}>{children}</NotificacoesContext.Provider>;
}

export function useNotificacoes(): NotificacoesContextValue {
  const ctx = useContext(NotificacoesContext);
  if (!ctx) {
    throw new Error('useNotificacoes deve ser usado dentro de <NotificacoesProvider>');
  }
  return ctx;
}

export function useNotificacoesOpcional(): NotificacoesContextValue | null {
  return useContext(NotificacoesContext);
}
