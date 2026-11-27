import { Outlet } from 'react-router-dom'

/** Moldura das páginas públicas (sem menu, sem sessão): só logo, conteúdo e rodapé. */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 font-sans">
      <header className="flex justify-center px-4 py-5">
        <img
          src="/assets/FSPH_PIN.png"
          alt="FSPH - Fundação de Saúde Parreiras Horta"
          className="h-12 max-w-full object-contain"
        />
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-10">
        <Outlet />
      </main>
      <footer className="px-4 pb-6 text-center text-[11px] leading-snug text-slate-500">
        Sistema Integrado de Gestão de Frotas • FSPH
      </footer>
    </div>
  )
}
