import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModalVeiculo } from './ModalVeiculo';

describe('ModalVeiculo', () => {
  it('deve rejeitar capacidade igual a zero ou negativa', async () => {
    const onSalvar = vi.fn();
    const onClose = vi.fn();

    render(<ModalVeiculo onClose={onClose} onSalvar={onSalvar} />);

    fireEvent.change(screen.getByLabelText(/Placa/i), { target: { value: 'ABC1D23' } });
    fireEvent.change(screen.getByLabelText(/Modelo/i), { target: { value: 'Gol 1.0' } });
    fireEvent.change(screen.getByLabelText(/Capacidade Máxima/i), { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Veículo/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/A capacidade deve ser um número inteiro de no mínimo 1/i),
      ).toBeInTheDocument();
    });

    expect(onSalvar).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deve rejeitar capacidade maior que 4 para frota SVO', async () => {
    const onSalvar = vi.fn();
    const onClose = vi.fn();

    render(<ModalVeiculo onClose={onClose} onSalvar={onSalvar} />);

    fireEvent.change(screen.getByLabelText(/Placa/i), { target: { value: 'SVO1234' } });
    fireEvent.change(screen.getByLabelText(/Modelo/i), { target: { value: 'Furgão SVO' } });
    fireEvent.change(screen.getByLabelText(/Tipo de Frota/i), { target: { value: 'SVO' } });
    fireEvent.change(screen.getByLabelText(/Capacidade Máxima/i), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Veículo/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Veículos da frota SVO podem ter capacidade máxima de até 4/i),
      ).toBeInTheDocument();
    });

    expect(onSalvar).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deve manter o modal aberto quando onSalvar rejeitar com erro', async () => {
    const onSalvar = vi.fn().mockRejectedValue(new Error('Placa já cadastrada no sistema'));
    const onClose = vi.fn();

    render(<ModalVeiculo onClose={onClose} onSalvar={onSalvar} />);

    fireEvent.change(screen.getByLabelText(/Placa/i), { target: { value: 'ABC1D23' } });
    fireEvent.change(screen.getByLabelText(/Modelo/i), { target: { value: 'Corolla' } });
    fireEvent.change(screen.getByLabelText(/Capacidade Máxima/i), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Veículo/i }));

    await waitFor(() => {
      expect(screen.getByText('Placa já cadastrada no sistema')).toBeInTheDocument();
    });

    expect(onSalvar).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deve salvar e fechar com dados válidos', async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<ModalVeiculo onClose={onClose} onSalvar={onSalvar} />);

    fireEvent.change(screen.getByLabelText(/Placa/i), { target: { value: 'XYZ9876' } });
    fireEvent.change(screen.getByLabelText(/Modelo/i), { target: { value: 'Spin' } });
    fireEvent.change(screen.getByLabelText(/Tipo de Frota/i), { target: { value: 'ADMINISTRATIVA' } });
    fireEvent.change(screen.getByLabelText(/Capacidade Máxima/i), { target: { value: '7' } });

    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Veículo/i }));

    await waitFor(() => {
      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({
          placa: 'XYZ9876',
          modelo: 'Spin',
          capacidade_maxima: 7,
          tipo_frota: 'ADMINISTRATIVA',
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});

