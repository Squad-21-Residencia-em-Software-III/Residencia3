import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { CircleUser, Info, LogOut, Smartphone } from 'lucide-react';
import { Modal } from '../ui';
import { ModalPreferenciasPwa } from '../pwa/ModalPreferenciasPwa';
import { cn } from '../../utils/cn';
import type { NavItem } from './AppLayout';
import { SinoNotificacoes } from './SinoNotificacoes';
import { ID_CONTEUDO, SaltoConteudo } from '../acessibilidade/SaltoConteudo';

type MotoristaLayoutProps = {
  navItems: NavItem[];
  title: string;
  user?: { name: string; role: string };
  onLogout: () => void;
  children: ReactNode;
};

/** Rótulos curtos, que cabem na barra inferior em telas de 320 px. */
const ROTULOS_CURTOS: Record<string, string> = {
  '/abastecimento': 'Abastecer',
  '/veiculos': 'Veículo',
};

/** Início no centro da barra, contando a Conta, que fica sempre por último. */
function comInicioNoCentro(itens: NavItem[]): NavItem[] {
  const inicio = itens.filter((item) => item.path === '/inicio');
  const outros = itens.filter((item) => item.path !== '/inicio');
  const meio = Math.floor((itens.length + 1) / 2);
  return [...outros.slice(0, meio), ...inicio, ...outros.slice(meio)];
}

const ITEM_BARRA =
  'relative flex h-full w-full flex-col items-center justify-center gap-1 font-display text-xs font-semibold no-underline active:bg-surface-hover [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:gap-1.5';

const OPCAO_CONTA =
  'flex min-h-13 w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 text-left text-[0.9375rem] font-semibold text-text no-underline active:bg-surface-hover';

/** Casca do motorista no celular: navegação na parte de baixo, ao alcance do polegar. */
export function MotoristaLayout({ navItems, title, user, onLogout, children }: MotoristaLayoutProps) {
  const [contaAberta, setContaAberta] = useState(false);
  const [preferenciasAbertas, setPreferenciasAbertas] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.layout = 'motorista';
    return () => {
      delete document.documentElement.dataset.layout;
    };
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-page-bg">
      <SaltoConteudo />
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-sidebar px-4 [@media(max-height:500px)]:h-12">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/assets/icon.png" alt="FSPH" className="h-8 w-8 shrink-0 object-contain" />
          <h1 className="m-0 truncate font-display text-base font-bold text-white">{title}</h1>
        </div>
        <SinoNotificacoes variante="escuro" className="shrink-0" />
      </header>

      <main
        id={ID_CONTEUDO}
        tabIndex={-1}
        className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 outline-none"
      >
        <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">{children}</div>
      </main>

      <nav
        aria-label="Navegação principal"
        className="h-(--altura-barra-inferior) shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="m-0 mx-auto flex h-full max-w-[560px] list-none p-0">
          {comInicioNoCentro(navItems).map(({ path, label, icon: Icon }) => (
            <li key={path} className="min-w-0 flex-1">
              <NavLink
                to={path}
                className={({ isActive }) =>
                  cn(
                    ITEM_BARRA,
                    isActive
                      ? 'text-primary before:absolute before:inset-x-4 before:top-0 before:h-[3px] before:rounded-b-full before:bg-primary'
                      : 'text-neutral',
                  )
                }
              >
                <Icon size={22} />
                <span className="truncate">{ROTULOS_CURTOS[path] ?? label}</span>
              </NavLink>
            </li>
          ))}
          {user && (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                className={cn(ITEM_BARRA, 'text-neutral')}
                aria-haspopup="dialog"
                onClick={() => setContaAberta(true)}
              >
                <CircleUser size={22} aria-hidden="true" />
                <span className="truncate">Conta</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {user && (
        <Modal
          isOpen={contaAberta}
          title="Minha conta"
          onClose={() => setContaAberta(false)}
          telaInteira
          gerenciarFoco
          ajustarAoTeclado
          folhaInferior
        >
          <p className="-mt-3 mb-4 text-sm text-neutral">
            <strong className="block text-[0.9375rem] text-text">{user.name}</strong>
            {user.role}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={OPCAO_CONTA}
              onClick={() => {
                setContaAberta(false);
                setPreferenciasAbertas(true);
              }}
            >
              <Smartphone size={20} className="text-primary" aria-hidden="true" /> Preferências do aplicativo
            </button>
            <Link to="/sobre" className={OPCAO_CONTA} onClick={() => setContaAberta(false)}>
              <Info size={20} className="text-primary" aria-hidden="true" /> Sobre Nós
            </Link>
            <button type="button" className={cn(OPCAO_CONTA, 'text-danger')} onClick={onLogout}>
              <LogOut size={20} aria-hidden="true" /> Sair da conta
            </button>
          </div>
        </Modal>
      )}
      <ModalPreferenciasPwa
        folhaInferior
        isOpen={preferenciasAbertas}
        onClose={() => setPreferenciasAbertas(false)}
      />
    </div>
  );
}
