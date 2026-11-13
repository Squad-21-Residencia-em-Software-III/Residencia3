import { useAuth } from '../contexts/AuthContext';
import { LISTA_PERFIS, PERFIS } from '../types/usuario';
import type { Perfil } from '../types/usuario';

const { ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO, SOLICITANTE, MOTORISTA_FROTA, MOTORISTA_SVO } =
  PERFIS;

const GESTORES = [ADMINISTRADOR, GESTOR_FROTA, GESTOR_SVO] as const;
const MOTORISTAS = [MOTORISTA_FROTA, MOTORISTA_SVO] as const;

/**
 * Matriz de acesso por perfil, conforme o documento "Permissões e acesso a telas do sistema"
 * (Squad 21) e as regras confirmadas com o líder:
 * - O Administrador tem acesso total.
 * - O Gestor SVO edita só a frota SVO; na frota administrativa só solicita e visualiza
 *   (ver `podeEditarFrota`).
 * - O Solicitante vê só os veículos disponíveis, sem dados sensíveis.
 *
 * O front só esconde o que o perfil não pode usar; quem garante a regra é o backend (403).
 * Para liberar ou restringir uma funcionalidade, altere apenas esta tabela.
 */
export const PERMISSOES = {
  // Início: indicadores consolidados (Dashboard gerencial)
  'inicio.painelGerencial': GESTORES,

  // Solicitações de viagem
  'solicitacoes.acessar': [...GESTORES, SOLICITANTE],
  'solicitacoes.criar': [ADMINISTRADOR, SOLICITANTE, GESTOR_SVO],
  /** Lista as solicitações encaminhadas (não só as próprias). */
  'solicitacoes.listarTodas': GESTORES,
  /** Aprovar e recusar: o Gestor SVO não analisa a frota administrativa. */
  'solicitacoes.analisar': [ADMINISTRADOR, GESTOR_FROTA],
  /** Agendar a viagem de uma solicitação aprovada (frota administrativa). */
  'solicitacoes.agendar': [ADMINISTRADOR, GESTOR_FROTA],

  // Solicitações SVO (BL27)
  'triagemSvo.acessar': [ADMINISTRADOR, GESTOR_SVO],

  // Viagens e quilometragem
  'viagens.acessar': [...GESTORES, ...MOTORISTAS],
  /** Agendar a partir de solicitação aprovada (frota administrativa: sem o Gestor SVO). */
  'viagens.agendar': [ADMINISTRADOR, GESTOR_FROTA],
  'viagens.cancelar': GESTORES,
  /** Registrar saída e retorno (iniciar e finalizar com quilometragem). */
  'viagens.executar': [...GESTORES, ...MOTORISTAS],

  // Disponibilidade da frota por data e horário
  'agenda.acessar': GESTORES,

  // Veículos: consulta para todos (Solicitante em versão reduzida); cadastro para os gestores
  'veiculos.acessar': LISTA_PERFIS,
  /** Placa, km, histórico e demais dados do veículo. */
  'veiculos.detalhes': [...GESTORES, ...MOTORISTAS],
  'veiculos.cadastrar': GESTORES,

  // Abastecimentos
  'abastecimentos.acessar': [...GESTORES, ...MOTORISTAS],
  'abastecimentos.registrar': [...GESTORES, ...MOTORISTAS],

  // Manutenções, multas e documentos
  'manutencoes.acessar': GESTORES,
  'manutencoes.gerenciar': GESTORES,
  'multas.acessar': GESTORES,
  'multas.gerenciar': GESTORES,

  // Equipe: motoristas (gestores) e usuários/perfis (só Administrador)
  'equipe.acessar': GESTORES,
  'usuarios.gerenciar': [ADMINISTRADOR],

  // Auditoria
  'auditoria.acessar': [ADMINISTRADOR],
} as const satisfies Record<string, readonly Perfil[]>;

export type Permissao = keyof typeof PERMISSOES;

export function perfilPode(perfil: Perfil | null | undefined, permissao: Permissao): boolean {
  return perfil != null && (PERMISSOES[permissao] as readonly Perfil[]).includes(perfil);
}

/**
 * O Gestor SVO só altera itens da frota SVO; os demais gestores, qualquer frota.
 * Use junto com a permissão da ação (ex.: `veiculos.cadastrar`).
 */
export function podeEditarFrota(perfil: Perfil | null | undefined, tipoFrota: string | null | undefined) {
  if (perfil == null) return false;
  if (perfil === GESTOR_SVO) return tipoFrota === 'SVO';
  return true;
}

/** `const { pode, podeNaFrota } = usePermissao()` → `pode('viagens.agendar')`. */
export function usePermissao() {
  const { usuario } = useAuth();
  const perfil = usuario?.perfil;
  return {
    pode: (permissao: Permissao) => perfilPode(perfil, permissao),
    /** Permissão da ação + regra de frota (Gestor SVO só na frota SVO). */
    podeNaFrota: (permissao: Permissao, tipoFrota: string | null | undefined) =>
      perfilPode(perfil, permissao) && podeEditarFrota(perfil, tipoFrota),
  };
}
