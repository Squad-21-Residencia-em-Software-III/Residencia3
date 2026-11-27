import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout, type NavItem } from './AppLayout';
import { MotoristaLayout } from './MotoristaLayout';
import { HomeIcon } from '../ui';

// SCRUM-306: salto ao conteúdo, menu do celular e itens recolhidos.

const NAV: NavItem[] = [
  { path: '/inicio', label: 'Início', icon: HomeIcon },
  { path: '/viagens', label: 'Viagens', icon: HomeIcon, badge: 3 },
];

/** Simula a largura da tela para a media query `(min-width: 48rem)`. */
function telaLarga(larga: boolean) {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta.includes('min-width') ? larga : false,
    media: consulta,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function app() {
  return render(
    <MemoryRouter initialEntries={['/inicio']}>
      <AppLayout navItems={NAV} title="Início" user={{ name: 'Ana Souza', role: 'Gestor' }}>
        <p>conteúdo</p>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  it('o primeiro Tab é "Pular para o conteúdo", que leva o foco ao conteúdo principal', async () => {
    const user = userEvent.setup();
    app();
    await user.tab();
    const salto = screen.getByRole('link', { name: 'Pular para o conteúdo' });
    expect(salto).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('no celular, o menu fechado fica fora do Tab; aberto, deixa o resto inerte e fecha com Escape', async () => {
    telaLarga(false);
    const user = userEvent.setup();
    const { container } = app();
    const navegacao = container.querySelector('aside');
    expect(navegacao).toHaveAttribute('inert');

    const abrir = screen.getByRole('button', { name: 'Abrir menu de navegação' });
    expect(abrir).toHaveAttribute('aria-expanded', 'false');
    await user.click(abrir);
    expect(navegacao).not.toHaveAttribute('inert');
    expect(screen.getByRole('main').closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Início' })).toHaveFocus();
    expect(abrir).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(navegacao).toHaveAttribute('inert');
    expect(screen.getByRole('main').closest('[inert]')).toBeNull();
    expect(abrir).toHaveFocus();
  });

  it('na tela larga, o menu fica sempre acessível', () => {
    telaLarga(true);
    const { container } = app();
    expect(container.querySelector('aside')).not.toHaveAttribute('inert');
  });

  it('recolhido, cada item mantém o nome e o contador para o leitor de tela', async () => {
    telaLarga(true);
    const user = userEvent.setup();
    app();
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(screen.getByRole('link', { name: 'Viagens, 3' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Início' })).toBeInTheDocument();
  });
});

describe('MotoristaLayout', () => {
  it('tem o salto ao conteúdo e o conteúdo principal focável', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/inicio']}>
        <MotoristaLayout navItems={NAV} title="Início" onLogout={vi.fn()}>
          <p>conteúdo</p>
        </MotoristaLayout>
      </MemoryRouter>,
    );
    await user.tab();
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
