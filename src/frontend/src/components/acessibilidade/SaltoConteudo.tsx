import type { MouseEvent } from 'react';
import { ID_CONTEUDO } from '../layout/AcoesPublicasContext';

export { ID_CONTEUDO };

/**
 * Primeiro item do Tab: leva direto ao conteúdo, sem passar pelo menu (WCAG 2.4.1). Invisível até receber foco.
 * O conteúdo principal precisa de `id={ID_CONTEUDO}` e `tabIndex={-1}`.
 */
export function SaltoConteudo() {
  const irParaConteudo = (evento: MouseEvent<HTMLAnchorElement>) => {
    const destino = document.getElementById(ID_CONTEUDO);
    if (!destino) return;
    // Sem mudar a URL: o roteador não trata âncoras
    evento.preventDefault();
    destino.focus();
  };
  return (
    <a
      href={`#${ID_CONTEUDO}`}
      onClick={irParaConteudo}
      className="sr-only rounded-lg bg-primary px-4 py-3 font-display text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[300]"
    >
      Pular para o conteúdo
    </a>
  );
}
