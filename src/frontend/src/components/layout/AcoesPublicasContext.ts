import { createContext, type ReactNode } from 'react';

export const ID_CONTEUDO = 'conteudo';

export const AcoesPublicasContext = createContext<{
  saltoConteudo: ReactNode;
  preferencias: ReactNode;
} | null>(null);
