export type SeveridadeNotificacao = 'info' | 'success' | 'warning' | 'danger';

export type OperacaoNotificacao = 'Administrativo' | 'SVO';

/**
 * Tipos de referência oficiais da API de notificações (SCRUM-226 / `constants/referenciasNotificacao.ts`).
 */
export type ReferenciaTipoNotificacao =
  | 'SOLICITACAO_VIAGEM'
  | 'VIAGEM_FROTA'
  | 'SOLICITACAO_SVO'
  | 'ORDEM_SVO'
  | (string & {});

/**
 * Registro de notificação In-App alinhado à tabela `notificacoes` (SCRUM-225)
 * e ao contrato REST da API (SCRUM-226).
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
  url_destino: string | null;
  lida_em: string | null;
  criado_em: string;
  /** Quando `true`, o usuário perdeu acesso ao registro e o item deve ser exibido sem link. */
  acesso_revogado?: boolean;
}

export interface RespostaListaNotificacoes {
  itens: NotificacaoInApp[];
  proximo_cursor: string | null;
  nao_lidas: number;
  versao?: string;
}

export interface RespostaContadorNotificacoes {
  nao_lidas: number;
  versao?: string;
}

export interface RespostaMarcarLida {
  id?: number;
  lida_em?: string;
  atualizadas?: number;
  nao_lidas?: number;
  versao?: string;
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
