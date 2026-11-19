import { useEffect, useRef } from 'react';

import type { Veiculo } from '../types/veiculo';

/**
 * Mantém o veículo selecionado num formulário dentro da lista que o perfil pode usar
 * (ex.: Gestor de Frota só na frota administrativa, Gestor SVO só na SVO).
 * - Na primeira carga, pré-seleciona o primeiro veículo permitido.
 * - Uma seleção fora da lista (ex.: veículo inicial de outra frota) é trocada pelo primeiro
 *   permitido, ou limpa se não houver nenhum.
 * Antes de enviar, confira `selecaoValida`: o backend continua sendo quem garante a regra.
 */
export function useVeiculoPermitido(
  veiculos: Veiculo[],
  filtrar: ((veiculo: Veiculo) => boolean) | undefined,
  veiculoId: string,
  setVeiculoId: (id: string) => void,
) {
  const permitidos = filtrar ? veiculos.filter(filtrar) : veiculos;
  const selecaoValida = permitidos.some((v) => String(v.id) === veiculoId);
  const primeiroId = permitidos[0] ? String(permitidos[0].id) : '';
  const preencheu = useRef(false);

  useEffect(() => {
    if (veiculos.length === 0) return;
    if (!veiculoId) {
      // Pré-seleção só uma vez: depois, o usuário pode voltar para "Selecione"
      if (!preencheu.current && primeiroId) setVeiculoId(primeiroId);
      preencheu.current = true;
      return;
    }
    preencheu.current = true;
    if (!selecaoValida) setVeiculoId(primeiroId);
  }, [veiculos.length, veiculoId, selecaoValida, primeiroId, setVeiculoId]);

  return { permitidos, selecaoValida };
}

export const MENSAGEM_VEICULO_NAO_PERMITIDO =
  'Selecione um veículo que o seu perfil pode utilizar.';
