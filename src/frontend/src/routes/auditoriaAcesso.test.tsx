import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from './index';
import { useAuth } from '../contexts/AuthContext';
import { auditoriaApi } from '../services/api/auditoriaApi';
import { LISTA_PERFIS, PERFIS } from '../types/usuario';
import type { Perfil, Usuario } from '../types/usuario';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api/auditoriaApi', () => ({ auditoriaApi: { listar: vi.fn() } }));

const listarAuditoria = vi.mocked(auditoriaApi.listar);

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

const perfisSemAcesso = LISTA_PERFIS.filter((p) => p !== PERFIS.ADMINISTRADOR);

describe('Acesso à tela de Auditoria', () => {
  beforeEach(() => {
    listarAuditoria.mockReset();
    listarAuditoria.mockResolvedValue({
      dados: [],
      paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 },
    });
  });

  it.each(perfisSemAcesso)('%s não vê o item Auditoria no menu', (perfil) => {
    logarComo(perfil);
    abrir('/sobre');

    expect(screen.getAllByRole('link', { name: /Equipe/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Auditoria/ })).not.toBeInTheDocument();
  });

  it.each(perfisSemAcesso)('%s é levado à página 403 ao abrir /auditoria pela URL', (perfil) => {
    logarComo(perfil);
    abrir('/auditoria');

    expect(screen.getByRole('heading', { name: 'Acesso não autorizado' })).toBeInTheDocument();
    expect(listarAuditoria).not.toHaveBeenCalled();
  });

  it('Administrador vê o item no menu e consulta os registros', async () => {
    logarComo(PERFIS.ADMINISTRADOR);
    abrir('/auditoria');

    expect(screen.getAllByRole('link', { name: /Auditoria/ }).length).toBeGreaterThan(0);
    expect(await screen.findByText('Nenhum registro de auditoria encontrado.')).toBeInTheDocument();
    expect(listarAuditoria).toHaveBeenCalledWith(1, 20);
  });
});
