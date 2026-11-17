import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModalNovaSolicitacaoSvo } from './ModalNovaSolicitacaoSvo';
import { solicitacoesSvoApi } from '../../services/api/solicitacoesSvoApi';
import { ApiError } from '../../services/api/http';

vi.mock('../../services/api/solicitacoesSvoApi', () => ({
  solicitacoesSvoApi: { criar: vi.fn() },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { nome: 'Gestor SVO' } }) }));

describe('Nova solicitação SVO', () => {
  it('identifica o registrante e mostra a unidade SVO sem seletor', () => {
    render(<ModalNovaSolicitacaoSvo onClose={vi.fn()} onCriada={vi.fn()} />);
    expect(screen.getByLabelText('Registrado por')).toHaveValue('Gestor SVO');
    expect(screen.getByLabelText('Unidade')).toHaveValue('SVO');
    expect(screen.getByLabelText('Unidade')).toHaveAttribute('readonly');
    expect(screen.getByPlaceholderText('Informe o local de origem da ocorrência')).toHaveClass('text-ellipsis');
    expect(screen.getByPlaceholderText('Informe o destino da ocorrência')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Descreva a finalidade da viagem')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Material sensível')).not.toBeInTheDocument();
  });
  it('envia apenas campos autorizados, impede envio repetido e usa o id retornado', async () => {
    let resolver!: (valor: never) => void;
    vi.mocked(solicitacoesSvoApi.criar).mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const criada = vi.fn();
    render(<ModalNovaSolicitacaoSvo onClose={vi.fn()} onCriada={criada} />);
    await userEvent.type(screen.getByLabelText('Dados do solicitante *'), ' Pessoa ');
    await userEvent.type(screen.getByLabelText('Local de origem da ocorrência *'), ' Rua A ');
    await userEvent.type(screen.getByLabelText('Local de Destino *'), 'SVO');
    fireEvent.change(screen.getByLabelText('Data/Hora de Saída Desejada *'), { target: { value: '2099-01-01T10:00' } });
    await userEvent.type(screen.getByLabelText('Finalidade Institucional *'), 'Coleta');
    const form = screen.getByRole('button', { name: 'Registrar solicitação' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(solicitacoesSvoApi.criar).toHaveBeenCalledTimes(1);
    expect(solicitacoesSvoApi.criar).toHaveBeenCalledWith({
      dados_solicitante: 'Pessoa\nDestino: SVO\nSaída desejada: 2099-01-01T10:00\nFinalidade: Coleta',
      local_ocorrencia: 'Rua A',
    });
    resolver({ id: 42 } as never);
    await waitFor(() => expect(criada).toHaveBeenCalledWith(42));
  });

  it.each([400, 401, 403, 500])(
    'mostra erro %s e permite nova tentativa sem informar sucesso',
    async (status) => {
      vi.mocked(solicitacoesSvoApi.criar)
        .mockReset()
        .mockRejectedValue(new ApiError('Falha no servidor', status));
      const criada = vi.fn();
      render(<ModalNovaSolicitacaoSvo onClose={vi.fn()} onCriada={criada} />);
      await userEvent.type(screen.getByLabelText('Dados do solicitante *'), 'Pessoa');
      await userEvent.type(screen.getByLabelText('Local de origem da ocorrência *'), 'Rua A');
      await userEvent.type(screen.getByLabelText('Local de Destino *'), 'SVO');
      fireEvent.change(screen.getByLabelText('Data/Hora de Saída Desejada *'), { target: { value: '2099-01-01T10:00' } });
      await userEvent.type(screen.getByLabelText('Finalidade Institucional *'), 'Coleta');
      await userEvent.click(screen.getByRole('button', { name: 'Registrar solicitação' }));
      expect(await screen.findByText('Falha no servidor')).toBeInTheDocument();
      expect(criada).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Registrar solicitação' })).toBeEnabled();
    },
  );
});
