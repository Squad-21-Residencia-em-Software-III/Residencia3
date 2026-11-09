import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UsuariosPage from './UsuariosPage';
import { usuariosApi } from '../services/api/usuariosApi';

vi.mock('../services/api/usuariosApi', () => ({
  usuariosApi: {
    listar: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    redefinirSenha: vi.fn(),
  },
}));

vi.mock('../services/api/unidadesApi', () => ({
  unidadesApi: {
    listarGestores: vi.fn().mockResolvedValue([]),
    listar: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 1, nome: 'Admin', perfil: 'ADMINISTRADOR', ativo: true },
    temPerfil: () => true,
  }),
}));

describe('UsuariosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usuariosApi.listar).mockResolvedValue({
      dados: [
        {
          id: 1,
          nome: 'Carlos Silva',
          email: 'carlos@exemplo.com',
          tipo_usuario: 'ADMINISTRADOR',
          perfil: 'ADMINISTRADOR',
          ativo: true,
        },
        {
          id: 2,
          nome: 'Maria Souza',
          email: 'maria@exemplo.com',
          tipo_usuario: 'SOLICITANTE',
          perfil: 'SOLICITANTE',
          ativo: true,
        },
      ],
      paginacao: { pagina: 1, limite: 50, total: 2, totalPaginas: 1 },
    });
  });

  it('deve listar usuários retornados pela API', async () => {
    render(
      <MemoryRouter>
        <UsuariosPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Carregando usuários...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
      expect(screen.getByText('maria@exemplo.com')).toBeInTheDocument();
    });

    expect(usuariosApi.listar).toHaveBeenCalled();
  });
});
