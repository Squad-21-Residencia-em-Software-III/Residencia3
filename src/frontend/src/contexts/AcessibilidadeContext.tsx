import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  aplicarNoDocumento,
  carregarPreferencias,
  chaveDe,
  PREFERENCIAS_PADRAO,
  salvarPreferencias,
  type PreferenciasAcessibilidade,
} from '../utils/preferenciasAcessibilidade';

interface AcessibilidadeValor {
  preferencias: PreferenciasAcessibilidade;
  alterar: <C extends keyof PreferenciasAcessibilidade>(campo: C, valor: PreferenciasAcessibilidade[C]) => void;
  /** Volta tudo desta seção ao padrão, sem mexer no tema nem nas preferências de alertas. */
  restaurar: () => void;
}

const AcessibilidadeContext = createContext<AcessibilidadeValor | null>(null);

/** Precisa estar dentro do AuthProvider: as preferências são da conta que está usando o aparelho. */
export function AcessibilidadeProvider({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth();
  // Enquanto a sessão é conferida, continua com o que já está na tela (as do visitante, aplicadas no main.tsx)
  const dono = carregando ? null : (usuario?.id ?? null);
  const [estado, setEstado] = useState(() => ({ dono, preferencias: carregarPreferencias(dono) }));

  // Troca de conta (ou saída): carrega as preferências de quem está agora, sem herdar as da conta anterior
  if (estado.dono !== dono) setEstado({ dono, preferencias: carregarPreferencias(dono) });

  const preferencias = estado.dono === dono ? estado.preferencias : carregarPreferencias(dono);

  useEffect(() => {
    aplicarNoDocumento(preferencias);
  }, [preferencias]);

  // A mesma conta em outra aba: acompanha a mudança
  useEffect(() => {
    const aoMudarEmOutraAba = (evento: StorageEvent) => {
      if (evento.key === chaveDe(dono)) setEstado({ dono, preferencias: carregarPreferencias(dono) });
    };
    window.addEventListener('storage', aoMudarEmOutraAba);
    return () => window.removeEventListener('storage', aoMudarEmOutraAba);
  }, [dono]);

  const gravar = useCallback(
    (proximas: PreferenciasAcessibilidade) => {
      salvarPreferencias(dono, proximas);
      setEstado({ dono, preferencias: proximas });
    },
    [dono],
  );

  const valor = useMemo<AcessibilidadeValor>(
    () => ({
      preferencias,
      alterar: (campo, novo) => gravar({ ...preferencias, [campo]: novo }),
      restaurar: () => gravar({ ...PREFERENCIAS_PADRAO }),
    }),
    [preferencias, gravar],
  );

  return <AcessibilidadeContext.Provider value={valor}>{children}</AcessibilidadeContext.Provider>;
}

/** Fora do provider (telas e testes isolados): as do visitante deste aparelho, aplicadas na hora. */
function usePreferenciasAvulsas(ativo: boolean): AcessibilidadeValor {
  const [preferencias, setPreferencias] = useState(() => carregarPreferencias(null));
  return useMemo(() => {
    const gravar = (proximas: PreferenciasAcessibilidade) => {
      if (!ativo) return;
      salvarPreferencias(null, proximas);
      aplicarNoDocumento(proximas);
      setPreferencias(proximas);
    };
    return {
      preferencias,
      alterar: (campo, novo) => gravar({ ...preferencias, [campo]: novo }),
      restaurar: () => gravar({ ...PREFERENCIAS_PADRAO }),
    };
  }, [ativo, preferencias]);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAcessibilidade(): AcessibilidadeValor {
  const valor = useContext(AcessibilidadeContext);
  const avulsas = usePreferenciasAvulsas(valor === null);
  return valor ?? avulsas;
}
