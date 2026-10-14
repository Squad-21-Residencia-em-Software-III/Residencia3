export const PERFIS = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  SOLICITANTE: 'SOLICITANTE',
  GESTOR_FROTA: 'GESTOR_FROTA',
  GESTOR_SVO: 'GESTOR_SVO',
  MOTORISTA_FROTA: 'MOTORISTA_FROTA',
  MOTORISTA_SVO: 'MOTORISTA_SVO',
} as const;

export type Perfil = (typeof PERFIS)[keyof typeof PERFIS];

export const LISTA_PERFIS = Object.values(PERFIS) as [Perfil, ...Perfil[]];

export const DESCRICAO_PERFIS: Record<Perfil, string> = {
  ADMINISTRADOR: 'Gerenciamento do sistema, usuários, permissões e configurações gerais.',
  SOLICITANTE: 'Criação de solicitações de viagens institucionais e consulta do status da própria solicitação.',
  GESTOR_FROTA: 'Painéis, relatórios, cadastros de motoristas e veículos, análise e agendamento de solicitações.',
  GESTOR_SVO: 'Registro e triagem das solicitações da população e geração de ordens de coleta.',
  MOTORISTA_FROTA: 'Registro de viagens, abastecimentos e consulta dos veículos a ele vinculados.',
  MOTORISTA_SVO: 'Visualização das ordens alocadas e atualização do andamento dos atendimentos.',
};

export function tipoUsuarioDoPerfil(perfil: Perfil): string {
  return perfil === PERFIS.MOTORISTA_FROTA || perfil === PERFIS.MOTORISTA_SVO ? 'MOTORISTA' : perfil;
}
