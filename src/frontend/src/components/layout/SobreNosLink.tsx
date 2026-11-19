import { NavLink, useLocation, useMatch } from 'react-router-dom';
import { cn } from '../../utils/cn';

export const SOBRE_NOS_PATH = '/sobre';

export function SobreNosLink() {
  const { state } = useLocation();
  const sobreNos = useMatch(SOBRE_NOS_PATH);

  return (
    <NavLink
      to={SOBRE_NOS_PATH}
      end
      state={sobreNos ? state : { veioDeOutraTela: true }}
      className={({ isActive }) =>
        cn(
          'inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-primary bg-primary px-2.5 text-xs font-semibold whitespace-nowrap text-white no-underline transition-colors hover:border-primary-hover hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:px-3.5',
          isActive && 'bg-primary-hover shadow-inner',
        )
      }
    >
      Sobre Nós
    </NavLink>
  );
}
