import { recursoAtivo } from '../config/recursosBackend';
import { useAuth } from '../contexts/AuthContext';
import { LISTA_PERFIS, PERFIS } from '../types/usuario';
import type { Perfil } from '../types/usuario';
import type { TipoFrota } from '../types/veiculo';

const { ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO, SOLICITANTE, MOTORISTA_FROTA, MOTORISTA_SVO } =
  PERFIS;

const GESTORES = [ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO] as const;
const MOTORISTAS = [MOTORISTA_FROTA, MOTORISTA_SVO] as const;

/**
 * Matriz de acesso por perfil, conforme o documento "Permissões e acesso a telas do sistema"
 * (Squad 21) e as regras confirmadas com o líder:
 * - O Administrador tem acesso total e gerencia as duas frotas.
 * - Cada gestor altera só a própria operação (ver `podeEditarFrota`): o Gestor de Frota, a frota
 *   administrativa; o Gestor SVO, a frota SVO.
 * - O Gestor SVO solicita viagens administrativas e acompanha só as próprias; não aprova, não
 *   recusa e não agenda. Na operação SVO, aloca veículo e equipe nas ordens de coleta.
 * - Manutenções, multas e abastecimentos seguem o documento: Administrador e Gestor de Frota
 *   (abastecimentos também os motoristas).
 * - O Solicitante vê só os veículos disponíveis, sem dados sensíveis.
 *
 * O front só esconde o que o perfil não pode usar; quem garante a regra é o backend (403).
 * Para liberar ou restringir uma funcionalidade, altere apenas esta tabela.
 */
export const PERMISSOES = {
  // Início: indicadores consolidados (Dashboard gerencial)
  'inicio.painelGerencial': GESTORES,

  // Solicitações de viagem administrativas
  'solicitacoes.acessar': [...GESTORES, SOLICITANTE],
  'solicitacoes.criar': [ADMINISTRADOR, SOLICITANTE, GESTOR_SVO],
  /** Lista as solicitações de todos (não só as próprias). O Gestor SVO vê só as dele. */
  'solicitacoes.listarTodas': [ADMINISTRADOR, GESTOR_FROTA],
  /** Aprovar e recusar: o Gestor SVO não analisa a frota administrativa. */
  'solicitacoes.analisar': [ADMINISTRADOR, GESTOR_FROTA],
  /** Agendar a viagem de uma solicitação aprovada (frota administrativa). */
  'solicitacoes.agendar': [ADMINISTRADOR, GESTOR_FROTA],

  // Solicitações SVO (BL27)
  'triagemSvo.acessar': [ADMINISTRADOR, GESTOR_SVO],
  /** Confirmar ou recusar (com justificativa) um chamado SVO em triagem. */
  'triagemSvo.analisar': [ADMINISTRADOR, GESTOR_SVO],

  // Viagens e quilometragem
  'viagens.acessar': [...GESTORES, ...MOTORISTAS],
  /** Agendar viagem administrativa a partir de solicitação aprovada (sem o Gestor SVO). */
  'viagens.agendar': [ADMINISTRADOR, GESTOR_FROTA],
  /** Alocar veículo e equipe numa ordem de coleta SVO (RF22/RF23). */
  'viagens.alocarSvo': [ADMINISTRADOR, GESTOR_SVO],
  'viagens.cancelar': GESTORES,
  /** Aba Viagens > Administrativo (a API lista as viagens administrativas a esses perfis). */
  'viagens.operacaoAdministrativa': [ADMINISTRADOR, GESTOR_FROTA, MOTORISTA_FROTA],
  /** Aba Viagens > SVO: ordens de coleta (a API lista as ordens SVO a esses perfis). */
  'viagens.operacaoSvo': [ADMINISTRADOR, GESTOR_SVO, MOTORISTA_SVO],
  /**
   * Acompanhar as próprias viagens administrativas (Gestor SVO que solicitou). Quem já tem a aba
   * Administrativo completa, como o Administrador, não usa essa visão.
   */
  'viagens.acompanharProprias': [ADMINISTRADOR, GESTOR_SVO],
  /** Registrar saída e retorno (iniciar e finalizar com quilometragem). */
  'viagens.executar': [...GESTORES, ...MOTORISTAS],

  // Disponibilidade da frota por data e horário
  'agenda.acessar': GESTORES,

  // Veículos: consulta para todos (Solicitante em versão reduzida); cadastro para os gestores
  'veiculos.acessar': LISTA_PERFIS,
  /** Placa, km, histórico e demais dados do veículo. */
  'veiculos.detalhes': [...GESTORES, ...MOTORISTAS],
  /** Cadastrar e editar: cada gestor só na própria frota (`podeNaFrota`). */
  'veiculos.cadastrar': GESTORES,

  // Abastecimentos (documento: Motorista, Gestor de Frota e Administrador)
  'abastecimentos.acessar': [ADMINISTRADOR, GESTOR_FROTA, ...MOTORISTAS],
  'abastecimentos.registrar': [ADMINISTRADOR, GESTOR_FROTA, ...MOTORISTAS],

  // Manutenções e multas (documento: Gestor de Frota e Administrador)
  'manutencoes.acessar': [ADMINISTRADOR, GESTOR_FROTA],
  'manutencoes.gerenciar': [ADMINISTRADOR, GESTOR_FROTA],
  'multas.acessar': [ADMINISTRADOR, GESTOR_FROTA],
  'multas.gerenciar': [ADMINISTRADOR, GESTOR_FROTA],

  // Equipe: motoristas (gestores) e usuários/perfis (só Administrador)
  'equipe.acessar': GESTORES,
  'usuarios.gerenciar': [ADMINISTRADOR],

  // Auditoria
  'auditoria.acessar': [ADMINISTRADOR],
  /**
   * Fotos do odômetro (SCRUM-203): use com `podeNaFrota`. Administrador nas duas operações, Gestor
   * de Frota só nas administrativas e Gestor SVO só nas SVO, sem abrir a Auditoria aos gestores.
   */
  'evidenciasOdometro.ver': [ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO],

  // Relatórios gerenciais (BL35 / RF18 / RN20)
  'relatorios.exportar': [ADMINISTRADOR, GESTOR_FROTA],
} as const satisfies Record<string, readonly Perfil[]>;

export type Permissao = keyof typeof PERMISSOES;

export function perfilPode(perfil: Perfil | null | undefined, permissao: Permissao): boolean {
  return perfil != null && (PERMISSOES[permissao] as readonly Perfil[]).includes(perfil);
}

/** Frota em que cada perfil pode alterar itens. O Administrador altera as duas. */
const FROTA_DO_PERFIL: Partial<Record<Perfil, TipoFrota>> = {
  [GESTOR_FROTA]: 'ADMINISTRATIVA',
  [MOTORISTA_FROTA]: 'ADMINISTRATIVA',
  [GESTOR_SVO]: 'SVO',
  [MOTORISTA_SVO]: 'SVO',
};

/**
 * Cada perfil altera só itens da própria frota: Gestor e Motorista de Frota na administrativa,
 * Gestor e Motorista SVO na SVO; o Administrador, em qualquer uma. Frota desconhecida não libera.
 * Use junto com a permissão da ação (ex.: `veiculos.cadastrar`), como faz `podeNaFrota`.
 */
export function podeEditarFrota(
  perfil: Perfil | null | undefined,
  tipoFrota: string | null | undefined,
): boolean {
  if (perfil == null || tipoFrota == null) return false;
  if (perfil === ADMINISTRADOR) return tipoFrota === 'ADMINISTRATIVA' || tipoFrota === 'SVO';
  return FROTA_DO_PERFIL[perfil] === tipoFrota;
}

/**
 * Km, custos e históricos de um veículo. Quem gerencia frota só vê os da própria (o Administrador,
 * das duas); da outra frota, só a consulta básica (modelo, placa, status, capacidade).
 */
export function podeVerDetalhesDaFrota(
  perfil: Perfil | null | undefined,
  tipoFrota: string | null | undefined,
): boolean {
  if (!perfilPode(perfil, 'veiculos.detalhes')) return false;
  if (!perfilPode(perfil, 'veiculos.cadastrar')) return true;
  return podeEditarFrota(perfil, tipoFrota);
}

/** Tipos de operação que o perfil pode agendar (administrativa) ou alocar (SVO) em Viagens. */
export function operacoesAgendaveis(perfil: Perfil | null | undefined): TipoFrota[] {
  const tipos: TipoFrota[] = [];
  if (perfilPode(perfil, 'viagens.agendar')) tipos.push('ADMINISTRATIVA');
  if (perfilPode(perfil, 'viagens.alocarSvo')) tipos.push('SVO');
  return tipos;
}

/**
 * Abas de Viagens. Administrativo: quem gerencia ou executa a frota administrativa e, com a
 * consulta própria do backend (SCRUM-179), o Gestor SVO acompanhando só as viagens que pediu.
 */
export function abasDeViagens(
  perfil: Perfil | null | undefined,
  minhasViagensDisponivel: boolean,
): TipoFrota[] {
  const abas: TipoFrota[] = [];
  if (
    perfilPode(perfil, 'viagens.operacaoAdministrativa') ||
    (minhasViagensDisponivel && perfilPode(perfil, 'viagens.acompanharProprias'))
  ) {
    abas.push('ADMINISTRATIVA');
  }
  if (perfilPode(perfil, 'viagens.operacaoSvo')) abas.push('SVO');
  // A operação do próprio perfil vem primeiro
  return FROTA_DO_PERFIL[perfil as Perfil] === 'SVO' ? abas.reverse() : abas;
}

/** Abas disponíveis para cada perfil, sem conceder autorização no backend. */
export function abasDeVeiculos(perfil: Perfil | null | undefined): TipoFrota[] {
  if (perfil === ADMINISTRADOR) return ['ADMINISTRATIVA', 'SVO'];
  if (perfil === GESTOR_SVO) return ['SVO', 'ADMINISTRATIVA'];
  if (perfil === GESTOR_FROTA || perfil === MOTORISTA_FROTA) return ['ADMINISTRATIVA'];
  if (perfil === MOTORISTA_SVO) return ['SVO'];
  return [];
}

/** `const { pode, podeNaFrota } = usePermissao()` → `pode('viagens.agendar')`. */
export function usePermissao() {
  const { usuario } = useAuth();
  const perfil = usuario?.perfil;
  return {
    pode: (permissao: Permissao) => perfilPode(perfil, permissao),
    /** Permissão da ação + regra de frota (cada perfil só na própria frota). */
    podeNaFrota: (permissao: Permissao, tipoFrota: string | null | undefined) =>
      perfilPode(perfil, permissao) && podeEditarFrota(perfil, tipoFrota),
    /** Km, custos e históricos do veículo (gestor só da própria frota). */
    podeVerDetalhesDaFrota: (tipoFrota: string | null | undefined) =>
      podeVerDetalhesDaFrota(perfil, tipoFrota),
    /** Operações que o perfil pode abrir no agendamento de viagens. */
    operacoesAgendaveis: () => operacoesAgendaveis(perfil),
    /** Abas Administrativo/SVO de Viagens e de Veículos que o perfil pode ver. */
    abasDeViagens: () => abasDeViagens(perfil, recursoAtivo('minhasViagensAdministrativas')),
    abasDeVeiculos: () => abasDeVeiculos(perfil),
  };
}
