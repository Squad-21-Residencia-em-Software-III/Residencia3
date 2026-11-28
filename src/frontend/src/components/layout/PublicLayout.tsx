import { useContext } from 'react'
import { Outlet } from 'react-router-dom'
import { AcoesPublicasContext, ID_CONTEUDO } from './AcoesPublicasContext'

/** Moldura das páginas públicas (sem menu, sem sessão): só logo, conteúdo e rodapé. */
export function PublicLayout() {
  const acoes = useContext(AcoesPublicasContext)
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 font-sans">
      {acoes?.saltoConteudo}
      <header className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-3 px-4 py-5">
        <img
          src="/assets/FSPH_PIN.png"
          alt="FSPH - Fundação de Saúde Parreiras Horta"
          className="h-12 max-w-full object-contain"
        />
        {acoes?.preferencias}
      </header>
      <main id={ID_CONTEUDO} tabIndex={-1} className="mx-auto w-full max-w-xl flex-1 px-4 pb-10">
        <Outlet />
      </main>
      <footer className="px-4 pb-6 text-center text-[0.6875rem] leading-snug text-text-muted">
        Sistema Integrado de Gestão de Frotas • FSPH
      </footer>
    </div>
  )
}
