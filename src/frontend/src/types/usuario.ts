/**
 * Espelha a tabela `usuarios` do banco (migrations 20261014000001_create_initial_schema.js,
 * 20261014200000_regras_usuarios.js e 20261015000000_integridade_usuarios.js).
 * Não adicionar campos que não existam na modelagem oficial.
 */

export const PERFIS = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  SOLICITANTE: 'SOLICITANTE',
  GESTOR_FROTA: 'GESTOR_FROTA',
  GESTOR_SVO: 'GESTOR_SVO',
  MOTORISTA_FROTA: 'MOTORISTA_FROTA',
  MOTORISTA_SVO: 'MOTORISTA_SVO',
} as const;

export type Perfil = (typeof PERFIS)[keyof typeof PERFIS];

export const LISTA_PERFIS: Perfil[] = [
  PERFIS.ADMINISTRADOR,
  PERFIS.SOLICITANTE,
  PERFIS.GESTOR_FROTA,
  PERFIS.GESTOR_SVO,
  PERFIS.MOTORISTA_FROTA,
  PERFIS.MOTORISTA_SVO,
];

export type TipoUsuario = 'ADMINISTRADOR' | 'SOLICITANTE' | 'GESTOR_FROTA' | 'GESTOR_SVO' | 'MOTORISTA';

export const LABELS_PERFIS: Record<Perfil, string> = {
  ADMINISTRADOR: 'Administrador',
  SOLICITANTE: 'Solicitante',
  GESTOR_FROTA: 'Gestor de Frota',
  GESTOR_SVO: 'Gestor SVO',
  MOTORISTA_FROTA: 'Motorista Frota',
  MOTORISTA_SVO: 'Motorista SVO',
};

export const DESCRICAO_PERFIS: Record<Perfil, string> = {
  ADMINISTRADOR: 'Gerenciamento do sistema, usuários, permissões e configurações gerais.',
  SOLICITANTE: 'Criação de solicitações de viagens institucionais e consulta do status.',
  GESTOR_FROTA: 'Painéis, relatórios, cadastros de veículos e agendamento de viagens da Frota.',
  GESTOR_SVO: 'Registro e triagem das solicitações e geração de ordens de serviço do SVO.',
  MOTORISTA_FROTA: 'Registro de viagens, abastecimentos e consulta dos veículos vinculados.',
  MOTORISTA_SVO: 'Visualização das ordens alocadas e atualização do andamento no SVO.',
};

/**
 * Regra do banco (chk_usuarios_tipo_usuario):
 * MOTORISTA_FROTA e MOTORISTA_SVO geram tipo 'MOTORISTA'; demais geram o próprio perfil.
 */
export function tipoUsuarioDoPerfil(perfil: Perfil): TipoUsuario {
  return perfil === PERFIS.MOTORISTA_FROTA || perfil === PERFIS.MOTORISTA_SVO
    ? 'MOTORISTA'
    : (perfil as TipoUsuario);
}

export interface Usuario {
  id: number;
  nome: string; // varchar(255), notNullable
  email: string; // varchar(255), notNullable, unique (lower)
  tipo_usuario: TipoUsuario; // varchar(50), notNullable
  perfil: Perfil; // varchar(50), notNullable
  ativo: boolean; // boolean, notNullable
}

export interface NovoUsuarioInput {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
}

export interface AtualizarUsuarioInput {
  nome?: string;
  email?: string;
  perfil?: Perfil;
  ativo?: boolean;
}
