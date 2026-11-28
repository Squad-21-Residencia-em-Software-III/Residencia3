import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { ID_CONTEUDO } from '../components/layout/AcoesPublicasContext';

interface DialogoAtivo {
  id: string;
  ancestrais: readonly string[];
  elemento: HTMLElement;
  camada: HTMLElement | null;
  acionador: HTMLElement | null;
}

export const ContextoDialogo = createContext<readonly string[]>([]);
const pilha: DialogoAtivo[] = [];
const isolados = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
let desbloquearRolagem: (() => void) | undefined;
let observador: MutationObserver | undefined;

function bloquearRolagem() {
  const estilos = [document.documentElement.style, document.body.style];
  const anteriores = estilos.flatMap((estilo) => ['overflow-x', 'overflow-y'].map((propriedade) => ({
    estilo, propriedade, valor: estilo.getPropertyValue(propriedade), prioridade: estilo.getPropertyPriority(propriedade),
  })));
  estilos.forEach((estilo) => estilo.setProperty('overflow', 'hidden', 'important'));
  return () => {
    estilos.forEach((estilo) => estilo.removeProperty('overflow'));
    for (const { estilo, propriedade, valor, prioridade } of anteriores) {
      if (valor) estilo.setProperty(propriedade, valor, prioridade);
    }
  };
}

function atualizarCamadas() {
  // Menu móvel (100) e aviso de atualização da PWA (110) ficam abaixo dos diálogos.
  pilha.forEach(({ camada }, indice) => {
    camada?.style.setProperty('z-index', String(120 + indice));
  });
}

const FOCAVEIS = [
  'a[href]', 'area[href]', 'button', 'input', 'select', 'textarea', 'iframe',
  'summary', '[tabindex]', '[contenteditable="true"]',
].join(',');

function podeReceberFoco(el: HTMLElement): boolean {
  return el.isConnected && !el.matches(':disabled, input[type=hidden]') &&
    !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
    (typeof el.checkVisibility !== 'function' || el.checkVisibility({ visibilityProperty: true }));
}

export function focaveisDe(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCAVEIS)]
    .filter((el) => el.tabIndex >= 0 && podeReceberFoco(el));
}

function focarDentro(elemento: HTMLElement, preferirInicial = true) {
  const itens = focaveisDe(elemento);
  const inicial = preferirInicial ? elemento.querySelector<HTMLElement>('[data-foco-inicial]') : null;
  const destino = (inicial && podeReceberFoco(inicial) ? inicial : null) ??
    itens.find((el) => !el.hasAttribute('data-fechar-dialogo')) ?? itens[0] ?? elemento;
  destino.focus();
}

function atualizarIsolamento(moverFoco?: () => void) {
  const desejados = new Set<HTMLElement>();
  let no: HTMLElement | null = pilha.at(-1)?.elemento ?? null;
  while (no && no !== document.body) {
    const pai: HTMLElement | null = no.parentElement;
    if (!pai) break;
    for (const irmao of pai.children) {
      if (irmao !== no && irmao instanceof HTMLElement && !irmao.matches('script,style,link,[data-fundo-dialogo][aria-hidden="true"]')) {
        desejados.add(irmao);
      }
    }
    no = pai;
  }

  for (const [elemento, anterior] of isolados) {
    if (desejados.has(elemento)) continue;
    elemento.toggleAttribute('inert', anterior.inert);
    if (anterior.ariaHidden === null) elemento.removeAttribute('aria-hidden');
    else elemento.setAttribute('aria-hidden', anterior.ariaHidden);
    isolados.delete(elemento);
  }
  moverFoco?.();
  for (const elemento of desejados) {
    if (isolados.has(elemento)) continue;
    isolados.set(elemento, { inert: elemento.hasAttribute('inert') || elemento.inert === true, ariaHidden: elemento.getAttribute('aria-hidden') });
    // Atributo explícito também permite verificar o isolamento em ambientes sem a propriedade inert.
    elemento.setAttribute('inert', '');
    elemento.setAttribute('aria-hidden', 'true');
  }
}

interface Opcoes {
  aberto: boolean;
  dialogo: RefObject<HTMLElement | null>;
  camada?: RefObject<HTMLElement | null>;
  aoFechar: () => void;
  fecharComEscape?: boolean;
  /** false preserva um foco inicial já posicionado pelo consumidor. */
  gerenciarFoco?: boolean;
}

export function useDialogoAcessivel({ aberto, dialogo, camada, aoFechar, fecharComEscape = true, gerenciarFoco = true }: Opcoes) {
  const id = useId();
  const ancestrais = useContext(ContextoDialogo);
  const opcoes = useRef({ aoFechar, fecharComEscape, gerenciarFoco });
  useLayoutEffect(() => {
    opcoes.current = { aoFechar, fecharComEscape, gerenciarFoco };
  });

  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (!aberto || !elemento) return;
    const filhoAberto = pilha.findIndex((outro) => outro.ancestrais.includes(id) || elemento.contains(outro.elemento));
    const ativo: DialogoAtivo = {
      id,
      ancestrais,
      elemento,
      camada: camada?.current ?? null,
      acionador: filhoAberto >= 0
        ? pilha[filhoAberto].acionador
        : document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    if (!pilha.length) {
      desbloquearRolagem = bloquearRolagem();
      observador = new MutationObserver(() => atualizarIsolamento());
      observador.observe(document.body, { childList: true, subtree: true });
    }
    if (filhoAberto < 0) pilha.push(ativo);
    else pilha.splice(filhoAberto, 0, ativo);
    atualizarCamadas();
    const noTopo = () => pilha.at(-1) === ativo;

    atualizarIsolamento(() => {
      if (noTopo() && (opcoes.current.gerenciarFoco || !elemento.contains(document.activeElement))) {
        focarDentro(elemento, opcoes.current.gerenciarFoco);
      }
    });
    const aoFocar = (evento: FocusEvent) => {
      if (noTopo() && evento.target instanceof Node && !elemento.contains(evento.target)) {
        focarDentro(elemento, false);
      }
    };
    const aoPressionar = (evento: KeyboardEvent) => {
      if (!noTopo()) return;
      if (evento.key === 'Escape') {
        evento.stopPropagation();
        if (opcoes.current.fecharComEscape) opcoes.current.aoFechar();
        return;
      }
      if (evento.key !== 'Tab') return;
      const itens = focaveisDe(elemento);
      const atual = itens.indexOf(document.activeElement as HTMLElement);
      if (atual === -1 || (evento.shiftKey && atual === 0) || (!evento.shiftKey && atual === itens.length - 1)) {
        evento.preventDefault();
        (itens[evento.shiftKey ? itens.length - 1 : 0] ?? elemento).focus();
      }
    };
    document.addEventListener('focusin', aoFocar);
    document.addEventListener('keydown', aoPressionar);
    return () => {
      document.removeEventListener('focusin', aoFocar);
      document.removeEventListener('keydown', aoPressionar);
      const estavaNoTopo = noTopo();
      pilha.splice(pilha.indexOf(ativo), 1);
      if (estavaNoTopo) ativo.camada?.style.removeProperty('z-index');
      if (!pilha.length) {
        observador?.disconnect();
        observador = undefined;
        desbloquearRolagem?.();
        desbloquearRolagem = undefined;
      }
      atualizarIsolamento(() => {
        if (!estavaNoTopo) return;
        const superior = pilha.at(-1)?.elemento;
        const acionador = ativo.acionador;
        const restaurar = () => {
          if (acionador && acionador !== document.body && acionador !== document.documentElement &&
              (!superior || superior.contains(acionador)) && podeReceberFoco(acionador)) {
            acionador.focus({ preventScroll: true });
            if (document.activeElement === acionador) return;
          }
          if (superior && !superior.contains(document.activeElement)) {
            focarDentro(superior, false);
          } else if (!superior) {
            document.getElementById(ID_CONTEUDO)?.focus({ preventScroll: true });
          }
        };
        restaurar();
        // Enquanto o Drawer anima, o nó focado continua montado. O commit do React pode
        // restaurar esse foco depois dos layout effects; confirme ao final do commit.
        queueMicrotask(() => {
          const foco = document.activeElement;
          if (pilha.at(-1)?.elemento === superior &&
              (foco === document.body || elemento.contains(foco))) restaurar();
        });
      });
    };
  }, [aberto, ancestrais, camada, dialogo, id]);

  return useMemo(() => [...ancestrais, id], [ancestrais, id]);
}
