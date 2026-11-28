/**
 * Páginas abertas a qualquer pessoa (SCRUM-249/250), sem login e sem tentativa de renovar sessão.
 * Mantenha esta lista alinhada com as rotas públicas em routes/index.tsx.
 * (`/solicitar-svo` entra aqui desde já; a página do formulário é do SCRUM-265.)
 */
export const ROTAS_PUBLICAS_ANONIMAS = ['/solicitar-svo', '/acompanhar'] as const

export function ehRotaPublicaAnonima(pathname: string): boolean {
  return ROTAS_PUBLICAS_ANONIMAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))
}
