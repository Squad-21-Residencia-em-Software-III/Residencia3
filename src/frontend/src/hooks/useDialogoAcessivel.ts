import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// Diálogos abertos, do mais antigo ao de cima. Só o de cima reage a Tab e Escape: com um modal aberto sobre
// outro (ex.: confirmação dentro de um formulário), Escape fecha só o de cima (SCRUM-306).
const pilha: symbol[] = [];

const FOCAVEIS = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'summary',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',');

/** Controles alcançáveis pelo Tab, na ordem da página. */
export function focaveisDe(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled') &&
      !el.hidden &&
      !el.closest('[inert]') &&
      // Escondido por CSS (inclusive por um ancestral); sem a API, considera visível
      (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true),
  );
}

interface Opcoes {
  aberto: boolean;
  dialogo: RefObject<HTMLElement | null>;
  aoFechar: () => void;
  /** false: Escape não fecha (ex.: envio em andamento). */
  fecharComEscape?: boolean;
  /** false: não move nem prende o foco (compatibilidade com usos antigos). */
  gerenciarFoco?: boolean;
}

/**
 * Comportamento de diálogo modal acessível (WCAG 2.4.3, 2.1.2 e padrão de diálogo da WAI-ARIA):
 * foco vai para dentro ao abrir (no elemento com `data-foco-inicial`, ou no primeiro controle que não seja o de
 * fechar), Tab e Shift+Tab ficam presos no diálogo, Escape fecha o de cima, e ao fechar o foco volta para quem
 * abriu. Se esse elemento não existe mais, vai para o conteúdo principal, em vez de se perder no topo da página.
 */
export function useDialogoAcessivel({ aberto, dialogo, aoFechar, fecharComEscape = true, gerenciarFoco = true }: Opcoes) {
  const fechar = useRef(aoFechar);
  const escape = useRef(fecharComEscape);
  useEffect(() => {
    fechar.current = aoFechar;
    escape.current = fecharComEscape;
  });

  useEffect(() => {
    if (!aberto) return;
    const id = Symbol('dialogo');
    pilha.push(id);
    const acionador = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const noTopo = () => pilha[pilha.length - 1] === id;

    if (gerenciarFoco && dialogo.current) {
      const elemento = dialogo.current;
      const itens = focaveisDe(elemento);
      const inicial =
        elemento.querySelector<HTMLElement>('[data-foco-inicial]') ??
        itens.find((el) => !el.hasAttribute('data-fechar-dialogo')) ??
        itens[0] ??
        elemento;
      inicial.focus();
    }

    const aoPressionar = (evento: KeyboardEvent) => {
      if (!noTopo()) return;
      if (evento.key === 'Escape') {
        if (!escape.current) return;
        evento.stopPropagation();
        fechar.current();
        return;
      }
      if (evento.key !== 'Tab' || !gerenciarFoco || !dialogo.current) return;
      const itens = focaveisDe(dialogo.current);
      if (itens.length === 0) {
        evento.preventDefault();
        dialogo.current.focus();
        return;
      }
      const atual = itens.indexOf(document.activeElement as HTMLElement);
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      // Saindo pelas pontas, ou com o foco fora do diálogo: volta para dentro
      if (atual === -1 || (evento.shiftKey && atual === 0) || (!evento.shiftKey && atual === itens.length - 1)) {
        evento.preventDefault();
        (evento.shiftKey ? ultimo : primeiro).focus();
      }
    };
    document.addEventListener('keydown', aoPressionar);

    return () => {
      document.removeEventListener('keydown', aoPressionar);
      const posicao = pilha.indexOf(id);
      if (posicao !== -1) pilha.splice(posicao, 1);
      if (!gerenciarFoco) return;
      if (acionador?.isConnected && !acionador.closest('[inert]')) {
        acionador.focus();
      } else {
        // Quem abriu sumiu (ex.: linha removida da lista): o foco vai para o conteúdo principal
        document.getElementById('conteudo')?.focus();
      }
    };
  }, [aberto, gerenciarFoco, dialogo]);
}
