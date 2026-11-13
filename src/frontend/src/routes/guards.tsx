import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Perfil } from '../types/usuario';
import { usePermissao } from '../utils/permissoes';
import type { Permissao } from '../utils/permissoes';

function TelaCarregando() {
  return <div className="grid h-full place-items-center text-text-muted">Carregando…</div>;
}

/** Só deixa passar quem está logado. Senão, manda para /login lembrando a página pedida. */
export function RotaProtegida() {
  const { usuario, carregando } = useAuth();
  const location = useLocation();

  if (carregando) return <TelaCarregando />;
  if (!usuario) return <Navigate to="/login" replace state={{ de: location.pathname }} />;
  return <Outlet />;
}

/** Só deixa passar quem tem um dos perfis. Se não tiver permissão, redireciona para a página 403. */
export function RotaPorPerfil({ perfis }: { perfis: Perfil[] }) {
  const { temPerfil } = useAuth();
  return temPerfil(...perfis) ? <Outlet /> : <Navigate to="/403" replace />;
}

/** Só deixa passar quem tem a permissão (ver utils/permissoes). Senão, página 403. */
export function RotaComPermissao({ permissao }: { permissao: Permissao }) {
  const { pode } = usePermissao();
  return pode(permissao) ? <Outlet /> : <Navigate to="/403" replace />;
}

/** Rotas públicas (login): quem já está logado vai direto à home. */
export function RotaPublica() {
  const { usuario, carregando } = useAuth();
  if (carregando) return <TelaCarregando />;
  if (usuario) return <Navigate to="/inicio" replace />;
  return <Outlet />;
}
