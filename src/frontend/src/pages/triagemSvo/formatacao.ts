import type { BadgeTone } from '../../components/ui';
import type { StatusOrdemSvo, StatusSolicitacaoSvo } from '../../types/solicitacaoSvo';

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

export function toneStatusOrdem(status: StatusOrdemSvo): BadgeTone {
  switch (status) {
    case 'AGUARDANDO_ALOCACAO':
      return 'warning';
    case 'ALOCADA':
      return 'info';
    case 'EM_DESLOCAMENTO':
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
