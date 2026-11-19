import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { evidenciasOdometroApi } from '../../services/api/evidenciasOdometroApi';
import { ModalExcecoesOdometro } from './ModalExcecoesOdometro';

vi.mock('../../services/api/evidenciasOdometroApi', () => ({
  evidenciasOdometroApi: { listarExcecoes: vi.fn(), decidirExcecao: vi.fn() },
}));

describe('Fila gerencial de autorizações sem foto', () => {
  it('filtra pela operação, exige justificativa e recarrega após confirmar a decisão', async () => {
    const pedido = {
      id: 8, viagem_id: 12, tipo_operacao: 'SVO', fase: 'CHEGADA', status: 'PENDENTE',
      motorista_nome: 'Condutor de teste', solicitada_em: '2026-11-19T13:00:00Z',
      motivo: 'A lente da câmera foi danificada.', justificativa: null, decidida_em: null,
    } as const;
    const api = vi.mocked(evidenciasOdometroApi);
    api.listarExcecoes.mockResolvedValueOnce({ dados: [pedido], tem_mais: false })
      .mockResolvedValueOnce({ dados: [], tem_mais: false });
    api.decidirExcecao.mockResolvedValue({ ...pedido, status: 'RECUSADA', justificativa: 'A câmera voltou a funcionar.' });

    render(<ModalExcecoesOdometro tipo="SVO" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Analisar pedido #8' }));
    const recusar = screen.getByRole('button', { name: 'Recusar' });
    expect(recusar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Justificativa da decisão'), { target: { value: 'A câmera voltou a funcionar.' } });
    fireEvent.click(recusar);
    await waitFor(() => expect(api.decidirExcecao).toHaveBeenCalledWith(pedido, 'RECUSADA', 'A câmera voltou a funcionar.'));
    expect(await screen.findByText('Nenhum pedido pendente nesta página.')).toBeInTheDocument();
    expect(api.listarExcecoes.mock.calls).toEqual([['SVO', 1], ['SVO', 1]]);
  });
});
