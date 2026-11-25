export type SeveridadeNotificacao = 'info' | 'success' | 'warning' | 'danger';

export type OperacaoNotificacao = 'Administrativo' | 'SVO';

export type ReferenciaTipoNotificacao =
  | 'SOLICITACAO'
  | 'VIAGEM'
  | 'MANUTENCAO'
  | 'MULTA'
  | 'VEICULO'
  | 'SISTEMA'
  | (string & {});

/**
 * Registro de notificação In-App alinhado à tabela `notificacoes` (SCRUM-225)
 * e ao contrato REST esperado da API (SCRUM-226).
 */
export interface NotificacaoInApp {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  severidade: SeveridadeNotificacao;
  operacao: OperacaoNotificacao;
  referencia_tipo: ReferenciaTipoNotificacao | null;
  referencia_id: number | null;
  url_destino: string;
  lida_em: string | null;
  criado_em: string;
}

export interface RespostaListaNotificacoes {
  itens: NotificacaoInApp[];
  proximo_cursor: string | null;
  nao_lidas: number;
}

export interface RespostaContadorNotificacoes {
  nao_lidas: number;
}

export interface RespostaMarcarLida {
  id?: number;
  lida_em?: string;
  atualizadas?: number;
  nao_lidas?: number;
}

/**
 * Payload exibido no Toast flutuante quando chega um evento com o app em primeiro plano
 * (ex.: atualização imediata ou mensagem vinda do Service Worker na SCRUM-239).
 */
export interface PayloadNotificacaoPrimeiroPlano {
  id: number | string;
  titulo: string;
  mensagem: string;
  severidade?: SeveridadeNotificacao;
  operacao?: OperacaoNotificacao;
  referencia_tipo?: ReferenciaTipoNotificacao | null;
  referencia_id?: number | null;
  url_destino?: string | null;
}
