import type { SolicitacaoViagem, ViagemResumoDashboard } from '../../types/solicitacao';

/**
 * DADOS FICTÍCIOS (mock). Não vêm do banco nem da API.
 * Baseados nas regras de `solicitacoes_viagem` e nos usuários solicitantes do seed.
 */
export const MOCK_SOLICITACOES: SolicitacaoViagem[] = [
  {
    id: 1042,
    solicitante_id: 2,
    solicitante_nome: 'Mariana Souza',
    origem: 'Sede FSPH - Aracaju',
    destino: 'Hospital de Urgência de Sergipe (HUSE)',
    finalidade: 'Transporte de insumos laboratoriais e documentos administrativos',
    data_saida_desejada: '2026-10-17T08:30:00',
    data_chegada_desejada: '2026-10-17T11:00:00',
    status: 'APROVADA',
  },
  {
    id: 1041,
    solicitante_id: 8,
    solicitante_nome: 'Juliana Costa',
    origem: 'Sede FSPH - Aracaju',
    destino: 'Hospital Regional de Lagarto',
    finalidade: 'Visita técnica de auditoria e inspeção de frotas descentralizadas',
    data_saida_desejada: '2026-10-17T09:15:00',
    data_chegada_desejada: '2026-10-17T17:00:00',
    status: 'PENDENTE_APROVACAO',
  },
  {
    id: 1040,
    solicitante_id: 2,
    solicitante_nome: 'Mariana Souza',
    origem: 'Hemose - Centro de Hemoterapia',
    destino: 'Maternidade Nossa Senhora de Lourdes',
    finalidade: 'Entrega emergencial de bolsas de sangue e hemoderivados',
    data_saida_desejada: '2026-10-17T10:00:00',
    data_chegada_desejada: '2026-10-17T12:00:00',
    status: 'APROVADA',
  },
  {
    id: 1039,
    solicitante_id: 2,
    solicitante_nome: 'Mariana Souza',
    origem: 'Sede FSPH - Aracaju',
    destino: 'Hospital Regional de Itabaiana',
    finalidade: 'Deslocamento de equipe de suporte de tecnologia e telecomunicações',
    data_saida_desejada: '2026-10-18T07:30:00',
    data_chegada_desejada: '2026-10-18T16:00:00',
    status: 'PENDENTE_APROVACAO',
  },
  {
    id: 1038,
    solicitante_id: 8,
    solicitante_nome: 'Juliana Costa',
    origem: 'Sede FSPH - Aracaju',
    destino: 'Hospital Regional de Propriá',
    finalidade: 'Apoio administrativo e treinamento de equipes locais',
    data_saida_desejada: '2026-10-19T08:00:00',
    data_chegada_desejada: '2026-10-19T18:00:00',
    status: 'PENDENTE_APROVACAO',
  },
  {
    id: 1037,
    solicitante_id: 2,
    solicitante_nome: 'Mariana Souza',
    origem: 'Almoxarifado Central FSPH',
    destino: 'Hospital Regional de Estância',
    finalidade: 'Reposição de Equipamentos de Proteção Individual (EPIs)',
    data_saida_desejada: '2026-10-15T08:00:00',
    data_chegada_desejada: '2026-10-15T15:00:00',
    status: 'APROVADA',
  },
  {
    id: 1036,
    solicitante_id: 8,
    solicitante_nome: 'Juliana Costa',
    origem: 'Sede FSPH - Aracaju',
    destino: 'Secretaria de Estado da Saúde (SES)',
    finalidade: 'Reunião intersetorial de planejamento orçamentário',
    data_saida_desejada: '2026-10-14T14:00:00',
    data_chegada_desejada: '2026-10-14T17:00:00',
    status: 'REJEITADA',
  },
];

/**
 * Viagens em andamento ativas (simulação de viagens_frota com status EM_ANDAMENTO).
 */
export const MOCK_VIAGENS_ATIVAS: ViagemResumoDashboard[] = [
  {
    id: 301,
    hora: '08:30',
    origem: 'Hemose',
    destino: 'HUSE',
    veiculo_modelo: 'Renault Master',
    veiculo_placa: 'GHI3F45',
    motorista_nome: 'João Santos',
  },
  {
    id: 302,
    hora: '09:15',
    origem: 'FSPH Sede',
    destino: 'HR Lagarto',
    veiculo_modelo: 'Chevrolet Onix',
    veiculo_placa: 'DEF2E34',
    motorista_nome: 'Marcos Oliveira',
  },
];
