import type { BadgeTone } from '../../components/ui';
import type {
  CanalOrigemSolicitacaoSvo,
  StatusOrdemSvo,
  StatusSolicitacaoSvo,
} from '../../types/solicitacaoSvo';

export function toneStatusSolicitacao(status: StatusSolicitacaoSvo): BadgeTone {
  switch (status) {
    case 'EM_TRIAGEM':
      return 'warning';
    case 'CONFIRMADA':
      return 'info';
    case 'EM_ANDAMENTO':
      return 'purple';
    case 'CONCLUIDA':
      return 'success';
    case 'RECUSADA':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** O canal externo ganha destaque próprio; interno segue neutro. O texto do selo é o que distingue. */
export function toneCanalOrigem(canal: CanalOrigemSolicitacaoSvo): BadgeTone {
  return canal === 'EXTERNA' ? 'info' : 'neutral';
}

export function toneStatusOrdem(status: StatusOrdemSvo): BadgeTone {
  switch (status) {
    case 'AGUARDANDO_ALOCACAO':
      return 'warning';
    case 'ALOCADA':
      return 'info';
    case 'EM_DESLOCAMENTO':
    case 'NO_LOCAL':
      return 'purple';
    case 'CONCLUIDA':
      return 'success';
    default:
      return 'neutral';
  }
}

export function formatarDataHora(valor?: string | null): string {
  if (!valor) return 'Não informado';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
