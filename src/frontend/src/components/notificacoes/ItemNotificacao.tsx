import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Lock } from 'lucide-react';
import { Badge, IdBadge } from '../ui';
import type { NotificacaoInApp, SeveridadeNotificacao } from '../../types/notificacao';
import { cn } from '../../utils/cn';

const ESTILO_SEVERIDADE: Record<
  SeveridadeNotificacao,
  { caixa: string; Icone: typeof Info }
> = {
  info: { caixa: 'bg-info-bg text-info', Icone: Info },
  success: { caixa: 'bg-success-bg text-success', Icone: CheckCircle2 },
  warning: { caixa: 'bg-warning-bg text-warning', Icone: AlertTriangle },
  danger: { caixa: 'bg-danger-bg text-danger-strong', Icone: AlertOctagon },
};

/** Prefixos alinhados aos tipos oficiais de `constants/referenciasNotificacao.ts` (SCRUM-226). */
const PREFIXO_REFERENCIA: Record<string, string> = {
  SOLICITACAO_VIAGEM: 'SOL',
  VIAGEM_FROTA: 'VG',
  SOLICITACAO_SVO: 'SVO',
  ORDEM_SVO: 'ORD',
};

export function formatarTempoRelativo(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';

  const diffSeg = Math.max(0, Math.floor((agora.getTime() - data.getTime()) / 1000));
  if (diffSeg < 60) return 'agora';

  const diffMin = Math.floor(diffSeg / 60);
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras} h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 7) return `há ${diffDias} d`;

  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatarIdentificadorReferencia(
  referenciaTipo: string | null,
  referenciaId: number | null,
): string | null {
  if (referenciaId == null) return null;
  const prefixo = referenciaTipo ? PREFIXO_REFERENCIA[referenciaTipo.toUpperCase()] : undefined;
  return prefixo ? `${prefixo}-#${referenciaId}` : `#${referenciaId}`;
}

interface ItemNotificacaoProps {
  notificacao: NotificacaoInApp;
  onSelecionar: (notificacao: NotificacaoInApp) => void;
}

export function ItemNotificacao({ notificacao, onSelecionar }: ItemNotificacaoProps) {
  const naoLida = notificacao.lida_em === null;
  const acessoRevogado = notificacao.acesso_revogado === true;
  const { caixa, Icone } = ESTILO_SEVERIDADE[notificacao.severidade] ?? ESTILO_SEVERIDADE.info;
  const refLabel = acessoRevogado
    ? null
    : formatarIdentificadorReferencia(notificacao.referencia_tipo, notificacao.referencia_id);
  const tempo = formatarTempoRelativo(notificacao.criado_em);

  const conteudo = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          acessoRevogado ? 'bg-neutral-bg text-neutral' : caixa,
        )}
      >
        {acessoRevogado ? <Lock size={15} /> : <Icone size={16} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-xs leading-snug text-text',
              naoLida ? 'font-bold' : 'font-semibold',
            )}
          >
            {notificacao.titulo}
          </p>
          {naoLida && (
            <span
              aria-label="Não lida"
              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
            />
          )}
        </div>

        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">
          {notificacao.mensagem}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {refLabel && <IdBadge id={refLabel} className="px-1.5 py-0.5 text-[0.625rem]" />}
          <Badge
            tone={notificacao.operacao === 'SVO' ? 'purple' : 'info'}
            className="px-2 py-0.5 text-[0.625rem]"
          >
            {notificacao.operacao}
          </Badge>
          {acessoRevogado && naoLida && (
            <button
              type="button"
              onClick={() => onSelecionar(notificacao)}
              className="cursor-pointer font-display text-[0.6875rem] font-semibold text-primary hover:underline"
            >
              Marcar como lida
            </button>
          )}
          {tempo && (
            <span className="ml-auto text-[0.6875rem] whitespace-nowrap text-text-muted">{tempo}</span>
          )}
        </div>
      </div>
    </>
  );

  // Avisos com acesso revogado são exibidos sem link de navegação (contrato SCRUM-226).
  if (acessoRevogado) {
    return (
      <li className="border-b border-divider last:border-b-0">
        <div
          data-testid={`notificacao-revogada-${notificacao.id}`}
          className={cn(
            'flex w-full items-start gap-3 px-3.5 py-3 text-left',
            naoLida ? 'bg-primary-soft/50' : 'bg-surface',
          )}
        >
          {conteudo}
        </div>
      </li>
    );
  }

  return (
    <li className="border-b border-divider last:border-b-0">
      <button
        type="button"
        onClick={() => onSelecionar(notificacao)}
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
          naoLida ? 'bg-primary-soft/75 hover:bg-surface-hover' : 'bg-surface hover:bg-surface-alt',
        )}
      >
        {conteudo}
      </button>
    </li>
  );
}
