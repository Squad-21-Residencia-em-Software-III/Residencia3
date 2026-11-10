/**
 * Espelha a resposta de GET /auditorias (tabela `auditorias`, BL04 / RF27).
 * Não adicionar campos que a API não retorna.
 */
export interface RegistroAuditoria {
  id: number;
  usuario_id: number | null; // nulo quando a ação não tem usuário identificado
  acao: string; // varchar(255)
  modulo: string; // varchar(100), ex.: AUTENTICACAO, VIAGENS
  data_hora: string; // timestamp
}

/** Rótulos de exibição dos módulos conhecidos; códigos novos aparecem como vierem da API. */
export const LABELS_MODULO_AUDITORIA: Record<string, string> = {
  AUTENTICACAO: 'Autenticação',
  USUARIOS: 'Usuários',
  VEICULOS: 'Veículos',
  MANUTENCOES: 'Manutenções',
  SOLICITACOES_VIAGEM: 'Solicitações de viagem',
  MULTAS: 'Multas',
  VIAGENS: 'Viagens',
  UNIDADES: 'Unidades',
};
