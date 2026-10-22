import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Perfil } from '../types/usuario'

function TelaCarregando() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
      Carregando…
    </div>
  )
}

/** Só deixa passar quem está logado. Senão, manda para /login lembrando a página pedida. */
export function RotaProtegida() {
  const { usuario, carregando } = useAuth()
  const location = useLocation()

  if (carregando) return <TelaCarregando />
  if (!usuario) return <Navigate to="/login" replace state={{ de: location.pathname }} />
  return <Outlet />
}

/** Só deixa passar quem tem um dos perfis. Os demais voltam ao dashboard. */
export function RotaPorPerfil({ perfis }: { perfis: Perfil[] }) {
  const { temPerfil } = useAuth()
  return temPerfil(...perfis) ? <Outlet /> : <Navigate to="/dashboard" replace />
}

/** Rotas públicas (login): quem já está logado vai direto ao dashboard. */
export function RotaPublica() {
  const { usuario, carregando } = useAuth()
  if (carregando) return <TelaCarregando />
  if (usuario) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
