import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalAbastecimento } from './ModalAbastecimento';
import { veiculosApi } from '../../services/api/veiculosApi';
import { motoristasApi } from '../../services/api/motoristasApi';

const mockUseAuth = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../services/api/veiculosApi', () => ({
  veiculosApi: {
    listar: vi.fn(),
  },
}));

vi.mock('../../services/api/motoristasApi', () => ({
  motoristasApi: {
    listar: vi.fn(),
    buscarMeuPerfil: vi.fn(),
  },
}));

describe('ModalAbastecimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      usuario: { id: 99, nome: 'João Motorista', perfil: 'MOTORISTA_FROTA' },
      temPerfil: (p: string) => p === 'MOTORISTA_FROTA',
    });

    vi.mocked(veiculosApi.listar).mockResolvedValue([
      {
        id: 1,
        placa: 'ABC-1234',
        modelo: 'Van Ambulância',
        tipo_frota: 'ADMINISTRATIVA',
        status: 'DISPONIVEL',
        capacidade_maxima: 5,
        km_atual: 40000,
      },
    ]);
  });

  it('deve associar o motorista real quando buscarMeuPerfil retorna com sucesso', async () => {
    vi.mocked(motoristasApi.buscarMeuPerfil).mockResolvedValue({
      id: 5,
      usuario_id: 99,
      nome: 'João Motorista',
      numero_cnh: '12345678900',
      categoria_cnh: 'D',
      validade_cnh: '2028-10-10',
      tipo_motorista: 'FROTA',
      status: 'DISPONIVEL',
    });

    render(<ModalAbastecimento onClose={vi.fn()} onSalvar={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('João Motorista')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Salvar Abastecimento/i });
    expect(submitBtn).not.toBeDisabled();
    expect(
      screen.queryByText(/Seu usuário não possui um registro de motorista ativo vinculado no sistema/i)
    ).not.toBeInTheDocument();
  });

  it('deve exibir mensagem de bloqueio e desabilitar envio se buscarMeuPerfil falhar ou não encontrar registro', async () => {
    vi.mocked(motoristasApi.buscarMeuPerfil).mockRejectedValue(new Error('Perfil de motorista não encontrado'));

    render(<ModalAbastecimento onClose={vi.fn()} onSalvar={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /Seu usuário não possui um registro de motorista ativo vinculado no sistema. O cadastro de abastecimento está bloqueado./i
        )
      ).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Salvar Abastecimento/i });
    expect(submitBtn).toBeDisabled();
  });
});

