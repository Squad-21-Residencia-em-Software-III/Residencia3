import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserCheck, Shield } from 'lucide-react';
import { usePermissao } from '../utils/permissoes';
import MotoristasPage from './MotoristasPage';
import UsuariosPage from './UsuariosPage';
import { cn } from '../utils/cn';

type AbaEquipe = 'motoristas' | 'usuarios';

export default function EquipePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pode } = usePermissao();
  // Aba de usuários e perfis: só o Administrador
  const isAdmin = pode('usuarios.gerenciar');

  const abaUrl = searchParams.get('aba') as AbaEquipe | null;
  const abaAtiva: AbaEquipe =
    abaUrl === 'usuarios' && isAdmin ? 'usuarios' : 'motoristas';

  useEffect(() => {
    // Se o usuário tentar acessar ?aba=usuarios sem ser admin, corrige a URL
    if (abaUrl === 'usuarios' && !isAdmin) {
      setSearchParams({ aba: 'motoristas' }, { replace: true });
    }
  }, [abaUrl, isAdmin, setSearchParams]);

  const mudarAba = (aba: AbaEquipe) => {
    setSearchParams({ aba }, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Seletor de Abas - Alinhado à esquerda, visual de pílulas com alto contraste, sem contadores */}
      {isAdmin && (
        <div className="flex items-center">
          <div className="inline-flex items-center rounded-xl bg-slate-200/70 p-1.5 border border-slate-300/50 shadow-2xs">
            <button
              type="button"
              onClick={() => mudarAba('motoristas')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap',
                abaAtiva === 'motoristas'
                  ? 'bg-white text-navy-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 active:bg-slate-200/50'
              )}
            >
              <UserCheck size={16} />
              <span>Motoristas</span>
            </button>

            <button
              type="button"
              onClick={() => mudarAba('usuarios')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap',
                abaAtiva === 'usuarios'
                  ? 'bg-white text-navy-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 active:bg-slate-200/50'
              )}
            >
              <Shield size={16} />
              <span>Usuários</span>
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba com Transição Suave */}
      <div key={abaAtiva} className="animate-tab-fade">
        {abaAtiva === 'motoristas' ? <MotoristasPage /> : <UsuariosPage />}
      </div>
    </div>
  );
}

