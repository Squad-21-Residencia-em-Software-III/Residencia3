import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { ModalVeiculo } from './ModalVeiculo';

function preencherSvo(corpos: string) {
  fireEvent.change(screen.getByLabelText(/Placa/i), { target: { value: 'SVO1A23' } });
  fireEvent.change(screen.getByLabelText(/Modelo/i), { target: { value: 'Rabecão' } });
  fireEvent.change(screen.getByLabelText(/Capacidade Máxima/i), { target: { value: corpos } });
}

describe('ModalVeiculo: duas capacidades SVO (SCRUM-173)', () => {
  afterEach(() => {
    RECURSOS_BACKEND.lotacaoCabine = true;
  });

  it('separa os rótulos: passageiros no administrativo, corpos no SVO', () => {
    const { unmount } = render(<ModalVeiculo onClose={vi.fn()} onSalvar={vi.fn()} />);
    expect(screen.getByLabelText(/Capacidade Máxima de passageiros/)).toBeInTheDocument();
    unmount();

    render(<ModalVeiculo onClose={vi.fn()} onSalvar={vi.fn()} apenasFrota="SVO" />);
    expect(screen.getByLabelText(/Capacidade Máxima de corpos \* \(1 a 4\)/)).toBeInTheDocument();
  });

  it('sem a coluna do backend, não pede nem envia a lotação da cabine', async () => {
    RECURSOS_BACKEND.lotacaoCabine = false;
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(<ModalVeiculo onClose={vi.fn()} onSalvar={onSalvar} apenasFrota="SVO" />);

    expect(screen.queryByLabelText(/Lotação da cabine/)).not.toBeInTheDocument();
    preencherSvo('2');
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Veículo/i }));

    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(onSalvar.mock.calls[0][0]).not.toHaveProperty('lotacao_cabine');
  });

  it('com a coluna do backend, exige a cabine e envia separada dos corpos', async () => {
    RECURSOS_BACKEND.lotacaoCabine = true;
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(<ModalVeiculo onClose={vi.fn()} onSalvar={onSalvar} apenasFrota="SVO" />);

    preencherSvo('4');
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Veículo/i }));
    expect(
      await screen.findByText(/Informe a lotação da cabine: número inteiro de pessoas, contando o motorista/),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Lotação da cabine/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar Veículo/i }));

    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(onSalvar.mock.calls[0][0]).toMatchObject({
      tipo_frota: 'SVO',
      capacidade_maxima: 4,
      lotacao_cabine: 3,
    });
  });

  it('com a coluna do backend, veículo administrativo continua sem cabine', () => {
    RECURSOS_BACKEND.lotacaoCabine = true;
    render(<ModalVeiculo onClose={vi.fn()} onSalvar={vi.fn()} apenasFrota="ADMINISTRATIVA" />);
    expect(screen.queryByLabelText(/Lotação da cabine/)).not.toBeInTheDocument();
  });

  it('permite editar veículo legado sem preencher cabine desconhecida', async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(<ModalVeiculo onClose={vi.fn()} onSalvar={onSalvar} veiculoParaEditar={{
      id: 1, placa: 'SVO1A23', modelo: 'Rabecão', tipo_frota: 'SVO', capacidade_maxima: 4,
      lotacao_cabine: null, km_atual: 0, status: 'DISPONIVEL',
    }} />);
    fireEvent.change(screen.getByLabelText(/Capacidade Máxima/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(onSalvar.mock.calls[0][0]).toMatchObject({ capacidade_maxima: 2 });
    expect(onSalvar.mock.calls[0][0]).not.toHaveProperty('lotacao_cabine');
  });

  it('permite editar a cabine sem alterar a capacidade de corpos', async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(<ModalVeiculo onClose={vi.fn()} onSalvar={onSalvar} veiculoParaEditar={{
      id: 1, placa: 'SVO1A23', modelo: 'Rabecão', tipo_frota: 'SVO', capacidade_maxima: 4,
      lotacao_cabine: 2, km_atual: 0, status: 'DISPONIVEL',
    }} />);
    fireEvent.change(screen.getByLabelText(/Lotação da cabine/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(onSalvar.mock.calls[0][0]).toMatchObject({ capacidade_maxima: 4, lotacao_cabine: 3 });
  });
});
