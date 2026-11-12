import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from './index';
import { useAuth } from '../contexts/AuthContext';
import { solicitacoesSvoApi } from '../services/api/solicitacoesSvoApi';
import { LISTA_PERFIS, PERFIS } from '../types/usuario';
import type { Perfil, Usuario } from '../types/usuario';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api/solicitacoesSvoApi', () => ({
  solicitacoesSvoApi: { listar: vi.fn(), buscarPorId: vi.fn(), confirmar: vi.fn() },
}));

const listar = vi.mocked(solicitacoesSvoApi.listar);

function logarComo(perfil: Perfil) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, nome: 'Usuário Teste', email: 'teste@exemplo.com', perfil } as Usuario,
    carregando: false,
    login: vi.fn(),
    logout: vi.fn(),
    temPerfil: (...perfis: Perfil[]) => perfis.includes(perfil),
  });
}

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

const comAcesso: Perfil[] = [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO];
const semAcesso = LISTA_PERFIS.filter((p) => !comAcesso.includes(p));

describe('Acesso à tela de Triagem SVO', () => {
  beforeEach(() => {
    listar.mockReset();
    listar.mockResolvedValue({
      dados: [],
      paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 },
    });
  });

  it.each(semAcesso)('%s não vê o item no menu', (perfil) => {
    logarComo(perfil);
    abrir('/sobre');

    expect(screen.getAllByRole('link', { name: /Início/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Triagem SVO/ })).not.toBeInTheDocument();
  });

  it.each(semAcesso)('%s é levado à página 403 ao abrir /triagem-svo pela URL', (perfil) => {
    logarComo(perfil);
    abrir('/triagem-svo');

    expect(screen.getByRole('heading', { name: 'Acesso não autorizado' })).toBeInTheDocument();
    expect(listar).not.toHaveBeenCalled();
  });

  it.each(comAcesso)('%s vê o item no menu e consulta as solicitações', async (perfil) => {
    logarComo(perfil);
    abrir('/triagem-svo');

    expect(screen.getAllByRole('link', { name: /Triagem SVO/ }).length).toBeGreaterThan(0);
    expect(await screen.findByText('Nenhuma solicitação aguardando triagem.')).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith({ pagina: 1, limite: 20, status: 'EM_TRIAGEM' });
  });
});
