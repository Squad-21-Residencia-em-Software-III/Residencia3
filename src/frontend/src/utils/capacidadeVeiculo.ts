import type { TipoFrota } from '../types/veiculo';

/**
 * `capacidade_maxima` muda de sentido conforme a frota: na administrativa são lugares para
 * pessoas; na SVO, quantos corpos o veículo transporta (até 4). A capacidade da cabine SVO ainda
 * não existe no cadastro, então não é exibida.
 */
export function rotuloCapacidade({
  capacidade_maxima: n,
  tipo_frota,
}: {
  capacidade_maxima: number;
  tipo_frota: TipoFrota | string;
}): string {
  if (tipo_frota === 'SVO') return `Transporte de até ${n} ${n === 1 ? 'corpo' : 'corpos'}`;
  return `${n} ${n === 1 ? 'lugar' : 'lugares'}`;
}
