import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    vi.mocked(usuariosApi.listar).mockImplementation(async (filtros = {}) => {
      if (filtros.limite === 1) {
        // Indicadores globais
        return {
          dados: [],
          paginacao: { pagina: 1, limite: 1, total: 10, totalPaginas: 10 },
        };
      }
      return {
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
        paginacao: {
          pagina: filtros.pagina ?? 1,
          limite: 50,
          total: 100,
          totalPaginas: 2,
        },
      };
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

  it('deve navegar de página ao clicar no controle de paginação', async () => {
    render(
      <MemoryRouter>
        <UsuariosPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    });

    // Encontra o botão para ir para página 2
    const botaoPagina2 = screen.getByRole('button', { name: '2' });
    fireEvent.click(botaoPagina2);

    await waitFor(() => {
      expect(usuariosApi.listar).toHaveBeenCalledWith(
        expect.objectContaining({ pagina: 2 }),
      );
    });
  });

  it('deve repassar filtro de perfil para a API', async () => {
    render(
      <MemoryRouter>
        <UsuariosPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    });

    const selectFiltro = screen.getByLabelText('Filtrar por perfil');
    fireEvent.change(selectFiltro, { target: { value: 'ADMINISTRADOR' } });

    await waitFor(() => {
      expect(usuariosApi.listar).toHaveBeenCalledWith(
        expect.objectContaining({ perfil: 'ADMINISTRADOR', pagina: 1 }),
      );
    });
  });

  it('deve exibir mensagem de erro e botão de tentar novamente em caso de falha', async () => {
    vi.mocked(usuariosApi.listar).mockRejectedValueOnce(new Error('Falha de conexão com a API'));

    render(
      <MemoryRouter>
        <UsuariosPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Falha na comunicação com o servidor/i)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Tentar novamente/i }).length).toBeGreaterThan(0);
    });
  });
});
