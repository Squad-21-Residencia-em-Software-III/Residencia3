import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { recursoAtivo } from '../config/recursosBackend';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { mensagemDeErro } from '../services/api/http';
import { notificacoesApi } from '../services/api/notificacoesApi';
import {
  TIPO_MSG_PUSH_FOREGROUND,
  lerReferenciaPush,
} from '../sw/logicaPushSw';
import type {
  NotificacaoInApp,
  PayloadNotificacaoPrimeiroPlano,
  RespostaMarcarLida,
} from '../types/notificacao';
import { lerEstadoPush, atualizarBadgeDoVinculo } from '../sw/estadoPush';
import { sinalDaSessao, comLimite } from '../utils/operacoesPush';
import { useAuth } from './AuthContext';

export const INTERVALO_POLLING_NOTIFICACOES_MS = 60_000;
export const DEBOUNCE_FOCO_NOTIFICACOES_MS = 5_000;
export const LIMITE_PAGINA_NOTIFICACOES = 20;

export interface NotificacoesContextValue {
  versaoSessao?: number;
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
  carregarLista: (opcoes?: { forcar?: boolean; silencioso?: boolean }) => Promise<void>;
  carregarMais: () => Promise<void>;
  atualizarContador: () => Promise<void>;
  definirCentralAberta: (aberta: boolean) => void;
  marcarLida: (id: number) => Promise<void>;
  marcarTodasLidas: () => Promise<void>;
  marcarReferenciaLida: (referenciaTipo: string, referenciaId: number) => Promise<boolean>;
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
  const { usuario, versaoSessao } = useAuth();
  const idUsuario = usuario?.id ?? null;
  const sessao = useMemo(() => ({ id: idUsuario, versao: versaoSessao }), [idUsuario, versaoSessao]);
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

  const sessaoRef = useRef(sessao);
  const revisaoLista = useRef(0);
  const revisaoLeitura = useRef(0);
  const paginasPendentes = useRef(false);
  const operacoesPendentes = useRef(0);
  const precisaSincronizarLeituras = useRef(false);
  const [leiturasPendentes, setLeiturasPendentes] = useState<Map<symbol, number[]>>(new Map());
  const itensRef = useRef<NotificacaoInApp[]>(itens);
  itensRef.current = itens;
  const carregandoContadorRef = useRef(false);
  const carregandoListaRef = useRef(false);
  const ultimoSyncFocoRef = useRef(0);
  const centralAbertaRef = useRef(false);
  const idsToastExibidosRef = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    if (sessaoRef.current === sessao) return;
    sessaoRef.current = sessao;
    revisaoLista.current += 1;
    revisaoLeitura.current += 1;
    paginasPendentes.current = false;
    operacoesPendentes.current = 0;
    precisaSincronizarLeituras.current = false;
    carregandoContadorRef.current = false;
    carregandoListaRef.current = false;
    ultimoSyncFocoRef.current = 0;
    centralAbertaRef.current = false;
    idsToastExibidosRef.current.clear();
    setItens([]);
    setNaoLidas(0);
    setProximoCursor(null);
    setCarregando(false);
    setCarregandoMais(false);
    setJaCarregouLista(false);
    setErro(null);
    setToastAtivo(null);
    setLeiturasPendentes(new Map());
  }, [sessao]);

  const definirCentralAberta = useCallback((aberta: boolean) => {
    centralAbertaRef.current = aberta;
  }, []);

  const carregarLista = useCallback(async (opcoes?: { forcar?: boolean; silencioso?: boolean }) => {
    if (!recursoHabilitado || sessao.id === null) {
      setJaCarregouLista(true);
      return;
    }
    if (!online || (carregandoListaRef.current && !opcoes?.forcar)) return;

    const revisao = ++revisaoLista.current;
    const leitura = revisaoLeitura.current;
    const valida = () => sessaoRef.current === sessao && revisaoLista.current === revisao;
    carregandoListaRef.current = true;
    paginasPendentes.current = false;
    setCarregandoMais(false);
    if (!opcoes?.silencioso) {
      setCarregando(true);
      setErro(null);
    }
    try {
      const resposta = await notificacoesApi.listar({ limit: LIMITE_PAGINA_NOTIFICACOES });
      if (!valida()) return;
      const lista = deduplicarPorId(resposta?.itens ?? []);
      setItens((anterior) => {
        if (revisaoLeitura.current === leitura) return lista;
        const lidas = new Map(anterior.map(({ id, lida_em }) => [id, lida_em]));
        return lista.map((item) => ({ ...item, lida_em: item.lida_em ?? lidas.get(item.id) ?? null }));
      });
      setProximoCursor(resposta?.proximo_cursor ?? null);
      if (revisaoLeitura.current === leitura && operacoesPendentes.current === 0 && typeof resposta?.nao_lidas === 'number') {
        setNaoLidas(Math.max(0, resposta.nao_lidas));
      }
      setJaCarregouLista(true);
      setErro(null);
    } catch (e) {
      if (valida() && !opcoes?.silencioso) setErro(mensagemDeErro(e));
    } finally {
      if (valida()) {
        carregandoListaRef.current = false;
        setCarregando(false);
      }
    }
  }, [online, recursoHabilitado, sessao]);

  const sincronizarBadge = useCallback(async () => {
    if (!recursoHabilitado || !recursoAtivo('webPush') || !online || sessao.id === null) return;
    const sinal = sinalDaSessao();
    const leitura = revisaoLeitura.current;
    const valido = () => !sinal.aborted && sessaoRef.current === sessao && leitura === revisaoLeitura.current;
    const estado = await lerEstadoPush();
    if (!estado?.vinculo || estado.encerramento || !valido()) return;
    try {
      const iniciadoEm = Date.now();
      const { elegiveis } = await comLimite(sinal, notificacoesApi.badge);
      await atualizarBadgeDoVinculo(estado, elegiveis, valido, iniciadoEm);
    } catch {
      // O sino continua usando seu próprio contador e o badge será revalidado na próxima sincronização.
    }
  }, [online, recursoHabilitado, sessao]);

  const atualizarContador = useCallback(async () => {
    if (!recursoHabilitado || sessao.id === null || !online) return;
    if (centralAbertaRef.current) {
      await carregarLista({ silencioso: true });
      return;
    }
    if (carregandoContadorRef.current || operacoesPendentes.current > 0) return;
    const leitura = revisaoLeitura.current;
    carregandoContadorRef.current = true;
    try {
      const resposta = await notificacoesApi.contador();
      if (sessaoRef.current === sessao && revisaoLeitura.current === leitura) {
        setNaoLidas(Math.max(0, resposta?.nao_lidas ?? 0));
        void sincronizarBadge();
      }
    } catch {
      // A sincronização de fundo não interrompe a navegação.
    } finally {
      if (sessaoRef.current === sessao) carregandoContadorRef.current = false;
    }
  }, [carregarLista, online, recursoHabilitado, sessao, sincronizarBadge]);

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

  const carregarMais = useCallback(async () => {
    if (!recursoHabilitado || sessao.id === null || !online || !proximoCursor ||
        carregandoListaRef.current || paginasPendentes.current) return;
    const revisao = revisaoLista.current;
    const leitura = revisaoLeitura.current;
    const valida = () => sessaoRef.current === sessao && revisaoLista.current === revisao;
    paginasPendentes.current = true;
    setCarregandoMais(true);
    setErro(null);
    try {
      const resposta = await notificacoesApi.listar({ limit: LIMITE_PAGINA_NOTIFICACOES, cursor: proximoCursor });
      if (!valida()) return;
      if (revisaoLeitura.current === leitura && operacoesPendentes.current === 0) {
        setNaoLidas(Math.max(0, resposta?.nao_lidas ?? 0));
        void sincronizarBadge();
      }
      setItens((anterior) => deduplicarPorId([...anterior, ...(resposta?.itens ?? [])]));
      setProximoCursor(resposta?.proximo_cursor ?? null);
    } catch (e) {
      if (valida()) setErro(mensagemDeErro(e));
    } finally {
      if (valida()) {
        paginasPendentes.current = false;
        setCarregandoMais(false);
      }
    }
  }, [online, proximoCursor, recursoHabilitado, sessao]);

  const executarLeitura = useCallback(async (
    ids: number[],
    enviar: (confirmar: (idsConfirmados: number[], resposta: RespostaMarcarLida) => void) => Promise<void>,
    otimista: boolean,
    mostrarErro = false,
  ): Promise<boolean> => {
    if (!recursoHabilitado || sessao.id === null || !online || sessaoRef.current !== sessao) return false;
    const operacao = Symbol();
    revisaoLeitura.current += 1;
    operacoesPendentes.current += 1;
    if (operacoesPendentes.current > 1) precisaSincronizarLeituras.current = true;
    if (otimista) setLeiturasPendentes((anterior) => new Map(anterior).set(operacao, ids));
    try {
      await enviar((idsConfirmados, resposta) => {
        if (sessaoRef.current !== sessao) return;
        revisaoLeitura.current += 1;
        const alvos = new Set(idsConfirmados);
        const lidaEm = resposta?.lida_em ?? new Date().toISOString();
        setItens((anterior) => anterior.map((item) => alvos.has(item.id) && item.lida_em === null
          ? { ...item, lida_em: lidaEm } : item));
        if (operacoesPendentes.current === 1 && typeof resposta?.nao_lidas === 'number') {
          setNaoLidas(Math.max(0, resposta.nao_lidas));
        }
      });
      void sincronizarBadge();
      return sessaoRef.current === sessao;
    } catch (e) {
      if (sessaoRef.current === sessao) {
        precisaSincronizarLeituras.current = true;
        if (mostrarErro) setErro(mensagemDeErro(e));
      }
      return false;
    } finally {
      if (sessaoRef.current === sessao) {
        if (otimista) setLeiturasPendentes((anterior) => {
          const pendentes = new Map(anterior);
          pendentes.delete(operacao);
          return pendentes;
        });
        operacoesPendentes.current -= 1;
        if (operacoesPendentes.current === 0 && precisaSincronizarLeituras.current) {
          precisaSincronizarLeituras.current = false;
          void atualizarContador();
        }
      }
    }
  }, [atualizarContador, online, recursoHabilitado, sessao, sincronizarBadge]);

  const marcarLida = useCallback(async (id: number) => {
    await executarLeitura([id], async (confirmar) => confirmar([id], await notificacoesApi.marcarLida(id)), true);
  }, [executarLeitura]);

  const marcarTodasLidas = useCallback(async () => {
    const ids = itensRef.current.filter((item) => item.lida_em === null).map((item) => item.id);
    if (ids.length === 0) return;
    await executarLeitura(ids, async (confirmar) => {
      for (let inicio = 0; inicio < ids.length && sessaoRef.current === sessao; inicio += 1_000) {
        const lote = ids.slice(inicio, inicio + 1_000);
        confirmar(lote, await notificacoesApi.marcarTodasLidas(lote));
      }
    }, true, true);
  }, [executarLeitura, sessao]);

  const marcarReferenciaLida = useCallback(async (tipo: string, id: number) => {
    const ids = itensRef.current.filter((item) => item.referencia_tipo === tipo && item.referencia_id === id)
      .map((item) => item.id);
    return executarLeitura(ids, async (confirmar) =>
      confirmar(ids, await notificacoesApi.marcarReferenciaLida(tipo, id)), false);
  }, [executarLeitura]);

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

  const exibicao = useMemo(() => {
    const pendentes = new Set([...leiturasPendentes.values()].flat());
    const agora = new Date().toISOString();
    let novasLeituras = 0;
    const lista = itens.map((item) => {
      if (item.lida_em !== null || !pendentes.has(item.id)) return item;
      novasLeituras += 1;
      return { ...item, lida_em: agora };
    });
    return { itens: lista, naoLidas: Math.max(0, naoLidas - novasLeituras) };
  }, [itens, leiturasPendentes, naoLidas]);

  useEffect(() => {
    if (!recursoHabilitado || !recursoAtivo('webPush') || !online || sessao.id === null) return;
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const sinal = sinalDaSessao();
    const emConsulta = new Set<number>();
    let ativo = true;
    const valido = () => ativo && !sinal.aborted && sessaoRef.current === sessao;

    const aoReceberMensagem = async (evento: MessageEvent<unknown>) => {
      if (!sw.controller || evento.source !== sw.controller || !evento.data ||
          typeof evento.data !== 'object' || !('tipo' in evento.data) ||
          evento.data.tipo !== TIPO_MSG_PUSH_FOREGROUND) return;
      const referencia = lerReferenciaPush(evento.data);
      if (!referencia || emConsulta.has(referencia.notificacao_id)) return;
      const confirmar = (aceito: boolean) => evento.ports[0]?.postMessage(aceito);

      const id = referencia.notificacao_id;
      emConsulta.add(id);
      try {
        const estado = await lerEstadoPush();
        if (!valido() || estado?.vinculo !== referencia.vinculo || estado.encerramento) return;
        if (idsToastExibidosRef.current.has(String(id))) {
          confirmar(true);
          return;
        }
        const item = await comLimite(sinal, (signal) => notificacoesApi.obter(id, signal));
        const atual = await lerEstadoPush();
        if (valido() && atual?.geracao === estado.geracao && atual.vinculo === referencia.vinculo && item.id === id) {
          if (!item.acesso_revogado && item.lida_em === null) notificarEmPrimeiroPlano(item);
          confirmar(true);
        }
      } catch {
        // A central continua disponível e o Toast exige confirmação da API.
      } finally {
        emConsulta.delete(id);
      }
    };

    sw.addEventListener('message', aoReceberMensagem);
    return () => {
      ativo = false;
      sw.removeEventListener('message', aoReceberMensagem);
    };
  }, [notificarEmPrimeiroPlano, online, recursoHabilitado, sessao]);

  const valor = useMemo<NotificacoesContextValue>(
    () => ({
      versaoSessao,
      ...exibicao,
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
      definirCentralAberta,
      marcarLida,
      marcarTodasLidas,
      marcarReferenciaLida,
      notificarEmPrimeiroPlano,
      fecharToast,
    }),
    [
      versaoSessao,
      exibicao,
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
      definirCentralAberta,
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

/**
 * Marca como lidas as notificações vinculadas à entidade aberta na tela de negócio.
 * Seguro fora de `<NotificacoesProvider>` e deduplicado para não repetir chamadas desnecessárias.
 */
export function useMarcarReferenciaLida(
  referenciaTipo: string | null | undefined,
  referenciaId: number | null | undefined,
) {
  const ctx = useNotificacoesOpcional();
  const marcarReferenciaLida = ctx?.marcarReferenciaLida;
  const recursoHabilitado = ctx?.recursoHabilitado ?? false;
  const online = ctx?.online ?? false;
  const idsNaoLidos = ctx?.itens.filter((item) =>
    item.referencia_tipo === referenciaTipo && item.referencia_id === referenciaId && item.lida_em === null)
    .map((item) => item.id).join(',');
  const leituraRef = useRef<{ tentar: () => void } | null>(null);
  const marcarRef = useRef(marcarReferenciaLida);
  const mudouSessao = ctx?.versaoSessao;
  useLayoutEffect(() => { marcarRef.current = marcarReferenciaLida; }, [marcarReferenciaLida]);

  useEffect(() => {
    if (!recursoHabilitado || !online || !marcarRef.current || !referenciaTipo || referenciaId == null) return;
    let ativo = true;
    let emAndamento = false;
    let novaLeituraPendente = false;
    let tentativas = 0;
    let timer: number | undefined;
    const tentar = () => {
      if (!ativo) return;
      if (emAndamento) {
        novaLeituraPendente = true;
        return;
      }
      window.clearTimeout(timer);
      emAndamento = true;
      void marcarRef.current?.(referenciaTipo, referenciaId).then((leu) => {
        emAndamento = false;
        if (!ativo) return;
        if (novaLeituraPendente) {
          novaLeituraPendente = false;
          tentar();
          return;
        }
        if (leu || tentativas >= 2) return;
        tentativas += 1;
        timer = window.setTimeout(tentar, 5_000 * tentativas);
      });
    };
    leituraRef.current = { tentar };
    window.addEventListener('focus', tentarAposFalha);
    function tentarAposFalha() {
      if (tentativas > 0) {
        tentativas = 0;
        tentar();
      }
    }
    tentar();
    return () => {
      ativo = false;
      leituraRef.current = null;
      window.clearTimeout(timer);
      window.removeEventListener('focus', tentarAposFalha);
    };
  }, [mudouSessao, online, recursoHabilitado, referenciaId, referenciaTipo]);

  const ultimosIds = useRef(idsNaoLidos);
  useEffect(() => {
    if (idsNaoLidos && idsNaoLidos !== ultimosIds.current) leituraRef.current?.tentar();
    ultimosIds.current = idsNaoLidos;
  }, [idsNaoLidos]);
}
