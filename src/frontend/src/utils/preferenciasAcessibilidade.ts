/**
 * Preferências de acessibilidade (SCRUM-305 e SCRUM-307). Valem no aparelho: quem não entrou usa as do
 * visitante; cada conta tem as suas, e quem entra pela primeira vez parte das do visitante. Aplicadas como
 * atributos no <html>, lidos pelo CSS (styles/acessibilidade.css e styles/paletas.css).
 * O tema claro/escuro (SCRUM-303) é independente: estas preferências só ajustam o que vem por cima dele.
 */

export const ESCALAS_TEXTO = [0.875, 1, 1.125, 1.25, 1.5] as const;
export type EscalaTexto = (typeof ESCALAS_TEXTO)[number];

export const CONTRASTES = ['padrao', 'alto'] as const;
export type Contraste = (typeof CONTRASTES)[number];

/** `sistema`: segue a preferência do aparelho (prefers-reduced-motion). */
export const MOVIMENTOS = ['sistema', 'reduzido'] as const;
export type Movimento = (typeof MOVIMENTOS)[number];

export const PALETAS = ['padrao', 'protanopia', 'deuteranopia', 'tritanopia'] as const;
export type Paleta = (typeof PALETAS)[number];

export interface PreferenciasAcessibilidade {
  escalaTexto: EscalaTexto;
  contraste: Contraste;
  movimento: Movimento;
  paleta: Paleta;
}

export const PREFERENCIAS_PADRAO: PreferenciasAcessibilidade = Object.freeze({
  escalaTexto: 1,
  contraste: 'padrao',
  movimento: 'sistema',
  paleta: 'padrao',
});

const PREFIXO = 'fsph.acessibilidade';
const VERSAO = 1;

/** `null`: visitante (sem login). */
export function chaveDe(usuarioId: number | null): string {
  return usuarioId === null ? `${PREFIXO}.visitante` : `${PREFIXO}.conta.${usuarioId}`;
}

function valida<T>(lista: readonly T[], valor: unknown, padrao: T): T {
  return lista.includes(valor as T) ? (valor as T) : padrao;
}

/** Aceita só valores conhecidos: um dado antigo ou alterado à mão volta ao padrão, campo a campo. */
export function normalizar(bruto: unknown): PreferenciasAcessibilidade {
  const dados = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  return {
    escalaTexto: valida(ESCALAS_TEXTO, dados.escalaTexto, PREFERENCIAS_PADRAO.escalaTexto),
    contraste: valida(CONTRASTES, dados.contraste, PREFERENCIAS_PADRAO.contraste),
    movimento: valida(MOVIMENTOS, dados.movimento, PREFERENCIAS_PADRAO.movimento),
    paleta: valida(PALETAS, dados.paleta, PREFERENCIAS_PADRAO.paleta),
  };
}

function ler(chave: string): PreferenciasAcessibilidade | null {
  try {
    const texto = localStorage.getItem(chave);
    if (texto === null) return null;
    const { v, prefs } = JSON.parse(texto) as { v?: number; prefs?: unknown };
    return v === VERSAO ? normalizar(prefs) : null;
  } catch {
    // Armazenamento bloqueado ou valor corrompido: segue com o padrão
    return null;
  }
}

/** Da conta; se ela ainda não escolheu, as do visitante deste aparelho. */
export function carregarPreferencias(usuarioId: number | null): PreferenciasAcessibilidade {
  return ler(chaveDe(usuarioId)) ?? (usuarioId === null ? null : ler(chaveDe(null))) ?? { ...PREFERENCIAS_PADRAO };
}

export function salvarPreferencias(usuarioId: number | null, prefs: PreferenciasAcessibilidade): void {
  try {
    localStorage.setItem(chaveDe(usuarioId), JSON.stringify({ v: VERSAO, prefs: normalizar(prefs) }));
  } catch {
    // Sem armazenamento: vale só até recarregar
  }
}

export function iguaisAoPadrao(prefs: PreferenciasAcessibilidade): boolean {
  return (Object.keys(PREFERENCIAS_PADRAO) as (keyof PreferenciasAcessibilidade)[]).every(
    (campo) => prefs[campo] === PREFERENCIAS_PADRAO[campo],
  );
}

/** Só atributos e uma variável no <html>: nenhum filtro sobre o conteúdo (fotos e documentos ficam com as cores reais). */
export function aplicarNoDocumento(prefs: PreferenciasAcessibilidade, raiz: HTMLElement = document.documentElement): void {
  raiz.style.setProperty('--escala-texto', String(prefs.escalaTexto));
  raiz.dataset.contraste = prefs.contraste;
  raiz.dataset.movimento = prefs.movimento;
  raiz.dataset.paleta = prefs.paleta;
}
