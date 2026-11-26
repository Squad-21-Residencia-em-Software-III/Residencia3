import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCheck, RefreshCw, WifiOff } from 'lucide-react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { recursoAtivo } from '../../config/recursosBackend';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificacoesOpcional } from '../../contexts/NotificacoesContext';
import type { NotificacaoInApp } from '../../types/notificacao';
import { cn } from '../../utils/cn';
import { resolverDestinoNotificacao } from '../../utils/destinoNotificacao';
import { FaixaAlertasPushSino } from '../notificacoes/FaixaAlertasPushSino';
import { ItemNotificacao } from '../notificacoes/ItemNotificacao';
import { BellIcon } from '../ui';

export type NotificacaoItem = {
  id: string;
  titulo: string;
  descricao?: string;
  /** Texto já formatado, ex.: "há 5 min". */
  quando?: string;
  lida?: boolean;
};

type SinoNotificacoesProps = {
  /** Lista estática opcional (compatibilidade retroativa e testes isolados). */
  notificacoes?: NotificacaoItem[];
  /** Aparência do botão gatilho para cabeçalhos claros (`AppLayout`) ou escuros (`MotoristaLayout`). */
  variante?: 'claro' | 'escuro';
  /** Permite sobrescrever a flag de Web Push em testes automatizados. */
  webPushOverride?: boolean;
  className?: string;
};

export function rotuloBadge(total: number): string {
  return total > 99 ? '99+' : String(total);
}

function useNavegacaoSegura() {
  const dentroDoRouter = useInRouterContext();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const navigate = dentroDoRouter ? useNavigate() : null;
  return navigate;
}

function usePerfilAtual() {
  try {
    const { usuario } = useAuth();
    return usuario?.perfil ?? null;
  } catch {
    return null;
  }
}

/**
 * Sino de notificações do cabeçalho: componente reutilizável com badge e dropdown unificado
 * com ponta de balão (Desktop e Mobile). Fecha com Escape (devolvendo o foco ao sino),
 * clique fora ou perda de foco por Tab.
 */
export function SinoNotificacoes({
  notificacoes,
  variante = 'claro',
  webPushOverride,
  className,
}: SinoNotificacoesProps) {
  const [aberto, setAberto] = useState(false);
  const [avisoFallback, setAvisoFallback] = useState<string | null>(null);

  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painelId = useId();

  const ctx = useNotificacoesOpcional();
  const navigate = useNavegacaoSegura();
  const perfil = usePerfilAtual();

  const modoEstatico = notificacoes !== undefined;
  const modoIntegrado = !modoEstatico && ctx !== null;
  const recursoHabilitado = modoIntegrado && ctx.recursoHabilitado;
  const webPushAtivo = webPushOverride ?? recursoAtivo('webPush');
  const online = modoIntegrado ? ctx.online : true;

  const naoLidas = modoEstatico
    ? notificacoes.filter((n) => !n.lida).length
    : modoIntegrado
      ? ctx.naoLidas
      : 0;

  const carregarLista = ctx?.carregarLista;
  const definirCentralAberta = ctx?.definirCentralAberta;

  // Informa ao contexto quando o dropdown está aberto para sincronização pela versão do contador.
  useEffect(() => {
    if (!modoIntegrado || !definirCentralAberta) return;
    definirCentralAberta(aberto);
    return () => definirCentralAberta(false);
  }, [aberto, modoIntegrado, definirCentralAberta]);

  // Carrega a lista sob demanda ao abrir o dropdown no modo integrado.
  useEffect(() => {
    if (!aberto || !modoIntegrado || !recursoHabilitado || !carregarLista) return;
    void carregarLista();
  }, [aberto, modoIntegrado, recursoHabilitado, carregarLista]);

  // Fecha com Escape (devolvendo foco ao sino) ou clique fora.
  useEffect(() => {
    if (!aberto) return;

    const aoPressionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    const aoClicarFora = (evento: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    };

    document.addEventListener('keydown', aoPressionarTecla);
    document.addEventListener('pointerdown', aoClicarFora);
    return () => {
      document.removeEventListener('keydown', aoPressionarTecla);
      document.removeEventListener('pointerdown', aoClicarFora);
    };
  }, [aberto]);

  const rotuloAcessivel =
    naoLidas > 0
      ? `Notificações, ${naoLidas > 99 ? 'mais de 99' : naoLidas} não lidas`
      : 'Notificações';

  const aoSelecionarNotificacao = (item: NotificacaoInApp) => {
    if (ctx && item.lida_em === null && ctx.online) {
      void ctx.marcarLida(item.id);
    }

    if (item.acesso_revogado) {
      return;
    }

    const { url, usouFallback } = resolverDestinoNotificacao(item.url_destino, perfil);
    if (usouFallback) {
      setAvisoFallback('Você foi redirecionado para a página inicial disponível para o seu perfil.');
    } else {
      setAvisoFallback(null);
    }

    setAberto(false);
    if (navigate) {
      navigate(url);
    }
  };

  const itensIntegrados = modoIntegrado ? ctx.itens : [];
  const carregando = modoIntegrado ? ctx.carregando : false;
  const carregandoMais = modoIntegrado ? ctx.carregandoMais : false;
  const proximoCursor = modoIntegrado ? ctx.proximoCursor : null;
  const erro = modoIntegrado ? ctx.erro : null;

  const classeBotao =
    variante === 'escuro'
      ? 'relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-all hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
      : 'relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-all hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

  const classePonta =
    variante === 'escuro'
      ? 'absolute -top-1.5 right-3.5 h-3 w-3 rotate-45 border-t border-l border-border bg-surface'
      : 'absolute -top-1.5 right-[58px] h-3 w-3 rotate-45 border-t border-l border-border bg-surface md:right-3';

  return (
    <div
      ref={raiz}
      className={cn('relative', className)}
      onBlur={(evento) => {
        // Tab para fora do componente fecha o dropdown.
        if (aberto && !raiz.current?.contains(evento.relatedTarget as Node | null)) {
          if (evento.relatedTarget) setAberto(false);
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        className={classeBotao}
        aria-label={rotuloAcessivel}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        title="Notificações"
        onClick={() => setAberto((a) => !a)}
      >
        <BellIcon />
        {naoLidas > 0 && (
          <span
            data-testid="badge-notificacoes"
            aria-hidden="true"
            className={cn(
              'absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger-strong px-1 text-[10px] leading-none font-bold text-white ring-2',
              variante === 'escuro' ? 'ring-navy-900' : 'ring-surface',
            )}
          >
            {rotuloBadge(naoLidas)}
          </span>
        )}
      </button>

      {aberto && (
        <div
          id={painelId}
          role="dialog"
          aria-label="Notificações"
          className="fixed inset-x-3 top-16 z-60 rounded-lg border border-border bg-surface text-text shadow-xl md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-2.5 md:w-96"
        >
          {/* Ponta apontando para o sino */}
          <span aria-hidden="true" className={classePonta} />

          <div className="relative max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain rounded-lg bg-surface">
            {/* Cabeçalho do dropdown */}
            <div className="flex items-center justify-between gap-2 border-b border-divider px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <p className="font-display text-sm font-semibold text-text">Notificações</p>
                {naoLidas > 0 && (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 font-display text-[11px] font-bold text-primary">
                    {rotuloBadge(naoLidas)}
                  </span>
                )}
              </div>

              {recursoHabilitado && naoLidas > 0 && (
                <button
                  type="button"
                  disabled={!online || !ctx.itens.some((item) => item.lida_em === null)}
                  onClick={() => void ctx.marcarTodasLidas()}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-display text-[11px] font-semibold text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCheck size={14} aria-hidden="true" />
                  Marcar avisos exibidos como lidos
                </button>
              )}
            </div>

            {/* Faixa Offline */}
            {recursoHabilitado && !online && (
              <div
                role="status"
                className="flex items-center gap-2 border-b border-divider bg-warning-bg px-3.5 py-2 text-xs text-warning"
              >
                <WifiOff size={14} className="shrink-0" aria-hidden="true" />
                <span>Sem conexão. Ações de leitura ficam pausadas até reconectar.</span>
              </div>
            )}

            {/* Faixa contextual de Web Push (SCRUM-238), condicionada à flag `webPush` */}
            {recursoHabilitado && webPushAtivo && <FaixaAlertasPushSino online={online} />}

            {/* Aviso de redirecionamento seguro */}
            {avisoFallback && (
              <div className="border-b border-divider bg-info-bg/50 px-3.5 py-2 text-xs text-info">
                {avisoFallback}
              </div>
            )}

            {/* Corpo da central */}
            {modoEstatico ? (
              notificacoes.length === 0 ? (
                <div className="px-4 py-7 text-center">
                  <p className="font-display text-xs font-semibold text-text">Tudo em dia</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Você não tem notificações no momento.
                  </p>
                </div>
              ) : (
                <ul className="m-0 max-h-80 list-none overflow-y-auto p-0">
                  {notificacoes.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        'border-b border-divider px-3.5 py-2.5 last:border-b-0',
                        !n.lida && 'bg-info-bg/40',
                      )}
                    >
                      <p className="text-xs font-semibold text-text">{n.titulo}</p>
                      {n.descricao && (
                        <p className="mt-0.5 text-xs text-text-muted">{n.descricao}</p>
                      )}
                      {n.quando && <p className="mt-1 text-xs text-text-muted">{n.quando}</p>}
                    </li>
                  ))}
                </ul>
              )
            ) : carregando && itensIntegrados.length === 0 ? (
              <div
                aria-label="Carregando notificações"
                data-testid="skeleton-notificacoes"
                className="divide-y divide-divider"
              >
                {[0, 1, 2].map((indice) => (
                  <div key={indice} className="flex animate-pulse items-start gap-3 px-3.5 py-3">
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-neutral-bg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-3/4 rounded bg-neutral-bg" />
                      <div className="h-2.5 w-full rounded bg-neutral-bg" />
                      <div className="h-2.5 w-1/3 rounded bg-neutral-bg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : erro && itensIntegrados.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <AlertCircle
                  size={20}
                  className="mx-auto text-danger-strong"
                  aria-hidden="true"
                />
                <p className="mt-2 font-display text-xs font-semibold text-text">
                  Não foi possível carregar as notificações
                </p>
                <p className="mt-1 text-xs text-text-muted">{erro}</p>
                <button
                  type="button"
                  disabled={!online}
                  onClick={() => void ctx?.carregarLista({ forcar: true })}
                  className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 font-display text-xs font-semibold text-text transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  Tentar novamente
                </button>
              </div>
            ) : itensIntegrados.length === 0 ? (
              <div className="px-4 py-7 text-center">
                <p className="font-display text-xs font-semibold text-text">Tudo em dia</p>
                <p className="mt-1 text-xs text-text-muted">
                  Você não tem notificações no momento.
                </p>
              </div>
            ) : (
              <>
                {erro && (
                  <div className="flex items-center justify-between gap-2 border-b border-divider bg-danger-soft px-3.5 py-2 text-xs text-danger-strong">
                    <span className="truncate">{erro}</span>
                    <button
                      type="button"
                      disabled={!online}
                      onClick={() => void ctx?.carregarLista({ forcar: true })}
                      className="shrink-0 cursor-pointer font-semibold underline disabled:opacity-50"
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}

                <ul className="m-0 max-h-96 list-none overflow-y-auto p-0">
                  {itensIntegrados.map((item) => (
                    <ItemNotificacao
                      key={item.id}
                      notificacao={item}
                      onSelecionar={aoSelecionarNotificacao}
                    />
                  ))}
                </ul>

                {proximoCursor ? (
                  <div className="border-t border-divider p-2 text-center">
                    <button
                      type="button"
                      disabled={carregandoMais || !online}
                      onClick={() => void ctx?.carregarMais()}
                      className="w-full cursor-pointer rounded-md py-1.5 font-display text-xs font-semibold text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {carregandoMais ? 'Carregando...' : 'Carregar mais'}
                    </button>
                  </div>
                ) : (
                  <p className="border-t border-divider px-3.5 py-2 text-center text-[11px] text-text-muted">
                    Fim das notificações. Lidas ficam disponíveis por 30 dias e não lidas por 90 dias.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
