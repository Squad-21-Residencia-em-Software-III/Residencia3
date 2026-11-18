import {
  CAPACIDADE_MAXIMA_SVO,
  STATUS_ORDEM_SVO_OCUPA_VAGA,
  STATUS_VEICULO_SVO_ALOCAVEL,
} from '../constants/veiculoSvo';
import { AppError } from '../errors/AppError';

export interface VeiculoParaAlocacao {
  tipo_frota: string;
  status: string;
  capacidade_maxima: number;
}

// Ordem que já ocupa o veículo (ALOCADA ou EM_DESLOCAMENTO)
export interface OrdemDoVeiculo {
  motorista_id: number | null;
  capacidade_utilizada: number;
  status: string;
}

export interface PedidoDeAlocacao {
  motoristaId: number;
  capacidade: number;
}

// Capacidade que vale para a alocação: a do veículo, limitada ao teto de 4 óbitos (RN11),
// mesmo que o cadastro tenha um valor maior
export function capacidadeEfetiva(capacidadeMaxima: number): number {
  return Math.min(Math.max(capacidadeMaxima, 0), CAPACIDADE_MAXIMA_SVO);
}

export function vagasDisponiveis(veiculo: Pick<VeiculoParaAlocacao, 'capacidade_maxima'>, ordens: OrdemDoVeiculo[]): number {
  const ocupadas = ordens
    .filter((ordem) => (STATUS_ORDEM_SVO_OCUPA_VAGA as readonly string[]).includes(ordem.status))
    .reduce((total, ordem) => total + ordem.capacidade_utilizada, 0);

  return Math.max(capacidadeEfetiva(veiculo.capacidade_maxima) - ocupadas, 0);
}

// Regra de elegibilidade do veículo SVO para receber uma ordem (RN10, RN11 e RN12).
// Quem chama já deve ter bloqueado o veículo e lido suas ordens ativas, para a decisão
// valer no mesmo instante da gravação. A ordem das verificações define a mensagem
// devolvida quando há mais de um impedimento.
export function validarVeiculoParaOrdemSvo(
  veiculo: VeiculoParaAlocacao,
  ordensAtivas: OrdemDoVeiculo[],
  pedido: PedidoDeAlocacao,
): void {
  if (pedido.capacidade > CAPACIDADE_MAXIMA_SVO) {
    throw new AppError(`A capacidade utilizada não pode passar de ${CAPACIDADE_MAXIMA_SVO} óbitos por veículo`, 400);
  }
  if (veiculo.tipo_frota !== 'SVO') {
    throw new AppError('O veículo não pertence à frota SVO', 400);
  }
  if (ordensAtivas.some((ordem) => ordem.status === 'EM_DESLOCAMENTO')) {
    throw new AppError('O veículo está em deslocamento', 409);
  }
  if (!(STATUS_VEICULO_SVO_ALOCAVEL as readonly string[]).includes(veiculo.status)) {
    throw new AppError(`O veículo não está disponível para alocação (situação atual: ${veiculo.status})`, 409);
  }
  if (ordensAtivas.some((ordem) => ordem.motorista_id !== pedido.motoristaId)) {
    throw new AppError('O veículo já está alocado a outro motorista', 409);
  }

  const vagas = vagasDisponiveis(veiculo, ordensAtivas);
  if (pedido.capacidade > vagas) {
    throw new AppError(`O veículo não tem capacidade suficiente (vagas disponíveis: ${vagas})`, 409);
  }
}
