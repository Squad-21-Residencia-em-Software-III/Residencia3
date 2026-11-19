import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppRoutes } from './index';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAuth } from '../contexts/AuthContext';
import { LISTA_PERFIS } from '../types/usuario';
import type { Perfil, Usuario } from '../types/usuario';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../pages/HomePage', () => ({ default: () => <div>Central de Operações</div> }));

function definirSessao(perfil: Perfil | null) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: perfil ? ({ id: 1, nome: 'Usuário Teste', perfil } as Usuario) : null,
    carregando: false,
    login: vi.fn(),
    logout: vi.fn(),
    temPerfil: (...perfis: Perfil[]) => perfil !== null && perfis.includes(perfil),
  });
}

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

function linkSobreNos() {
  return screen.getByRole('link', { name: 'Sobre Nós' });
}

describe('Acesso à página Sobre Nós', () => {
  it.each(LISTA_PERFIS)('%s acessa a equipe pelo único link no Início', async (perfil) => {
    const user = userEvent.setup();
    definirSessao(perfil);
    abrir('/inicio');

    expect(screen.getByText('Central de Operações')).toBeInTheDocument();
    await user.click(linkSobreNos());

    expect(screen.getByRole('heading', { name: 'Conheça o Squad 21' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(linkSobreNos()).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/login', 'Bem-Vindo De Volta'],
    ['/403', 'Acesso não autorizado'],
    ['/500', 'Instabilidade no servidor'],
    ['/rota-inexistente', 'Página não encontrada'],
  ])('abre a página a partir de %s e retorna à tela de origem', async (caminho, titulo) => {
    const user = userEvent.setup();
    definirSessao(null);
    abrir(caminho);

    await user.click(linkSobreNos());
    expect(screen.getByRole('heading', { name: 'Conheça o Squad 21' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Navegação principal' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
  });

  it('exibe os nove integrantes no acesso direto e mantém Auditoria protegida', () => {
    definirSessao(null);
    abrir('/sobre');

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(9);
    expect(
      screen.getByRole('heading', { name: 'Lorena Mariah Oliveira Lima' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Auditoria' })).not.toBeInTheDocument();
  });

  it('mantém o acesso pelo login quando uma rota protegida é solicitada sem sessão', () => {
    definirSessao(null);
    abrir('/auditoria');

    expect(screen.getByRole('heading', { name: 'Bem-Vindo De Volta' })).toBeInTheDocument();
    expect(linkSobreNos()).toHaveAttribute('href', '/sobre');
  });

  it('permite abrir Sobre Nós após uma falha de renderização', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    definirSessao(null);

    function PaginaComFalha(): never {
      throw new Error('Falha de renderização simulada');
    }

    function Aplicacao() {
      const { pathname } = useLocation();
      return (
        <ErrorBoundary pathname={pathname}>
          {pathname === '/falha' ? <PaginaComFalha /> : <AppRoutes />}
        </ErrorBoundary>
      );
    }

    try {
      render(
        <MemoryRouter initialEntries={['/falha']}>
          <Aplicacao />
        </MemoryRouter>,
      );
      expect(
        screen.getByRole('heading', { name: 'Instabilidade no servidor' }),
      ).toBeInTheDocument();

      await user.click(linkSobreNos());
      expect(screen.getByRole('heading', { name: 'Conheça o Squad 21' })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
