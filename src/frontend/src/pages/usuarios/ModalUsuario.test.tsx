import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModalUsuario } from './ModalUsuario';

describe('ModalUsuario', () => {
  it('deve manter o modal aberto e exibir erro quando onSalvar falhar', async () => {
    const onSalvar = vi.fn().mockRejectedValue(new Error('E-mail já está em uso'));
    const onClose = vi.fn();

    render(
      <ModalUsuario
        emailsExistentes={[]}
        onClose={onClose}
        onSalvar={onSalvar}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Nome Completo \*/i), {
      target: { value: 'Novo Usuario' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail Institucional \*/i), {
      target: { value: 'novo@teste.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 dígitos (ex: Senha@123)'), {
      target: { value: 'Senha@123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite a mesma senha'), {
      target: { value: 'Senha@123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Usuário/i }));

    await waitFor(() => {
      expect(screen.getByText('E-mail já está em uso')).toBeInTheDocument();
    });

    expect(onSalvar).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deve fechar somente após sucesso na requisição', async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ModalUsuario
        emailsExistentes={[]}
        onClose={onClose}
        onSalvar={onSalvar}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Nome Completo \*/i), {
      target: { value: 'Novo Usuario' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail Institucional \*/i), {
      target: { value: 'novo@teste.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 dígitos (ex: Senha@123)'), {
      target: { value: 'Senha@123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite a mesma senha'), {
      target: { value: 'Senha@123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Usuário/i }));

    await waitFor(() => {
      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Novo Usuario',
          email: 'novo@teste.com',
          senha: 'Senha@123',
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
