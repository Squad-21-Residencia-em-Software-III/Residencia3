import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TipoFrota } from '../types/veiculo';

/** Valor de `?aba=` de cada operação. */
export const ABA_DA_OPERACAO: Record<TipoFrota, string> = {
  ADMINISTRATIVA: 'administrativo',
  SVO: 'svo',
};

const OPERACAO_DA_ABA: Record<string, TipoFrota> = {
  administrativo: 'ADMINISTRATIVA',
  svo: 'SVO',
};

/**
 * Aba Administrativo/SVO guardada na URL (`?aba=administrativo|svo`), como em EquipePage.
 * Aba ausente ou não permitida ao perfil cai na primeira permitida e a URL é corrigida, sem
 * liberar nada além do que o perfil já pode ver.
 */
export function useAbaOperacao(permitidas: TipoFrota[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaUrl = searchParams.get('aba');
  const pedida = abaUrl ? OPERACAO_DA_ABA[abaUrl] : undefined;
  const ativa: TipoFrota | undefined =
    pedida && permitidas.includes(pedida) ? pedida : permitidas[0];

  useEffect(() => {
    // Só corrige uma aba inválida; sem `?aba=` a URL fica como está
    if (abaUrl !== null && ativa && ABA_DA_OPERACAO[ativa] !== abaUrl) {
      setSearchParams({ aba: ABA_DA_OPERACAO[ativa] }, { replace: true });
    }
  }, [abaUrl, ativa, setSearchParams]);

  const mudar = (operacao: TipoFrota) => {
    if (permitidas.includes(operacao)) {
      setSearchParams({ aba: ABA_DA_OPERACAO[operacao] }, { replace: true });
    }
  };

  return { ativa, mudar };
}
