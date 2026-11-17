import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ModalNovaSolicitacao } from './ModalNovaSolicitacao';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { nome: 'Usuário' } }) }));
vi.mock('../../services/api/unidadesApi', () => ({ unidadesApi: { listarOpcoes: vi.fn().mockResolvedValue([{ id: 1, nome: 'Unidade' }]) } }));

describe('solicitação administrativa com material sensível', () => {
  it('envia a marcação quando selecionada', async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    render(<ModalNovaSolicitacao onClose={vi.fn()} onSalvar={salvar} />);
    await userEvent.selectOptions(await screen.findByLabelText('Unidade *'), '1');
    await userEvent.type(screen.getByLabelText('Local de Origem'), 'Origem');
    await userEvent.type(screen.getByLabelText('Local de Destino'), 'Destino');
    fireEvent.change(screen.getByLabelText('Data/Hora de Saída Desejada'), { target: { value: '2099-01-01T10:00' } });
    fireEvent.change(screen.getByLabelText('Retorno Previsto (Opcional)'), { target: { value: '' } });
    await userEvent.type(screen.getByLabelText('Finalidade Institucional *'), 'Transporte');
    await userEvent.click(screen.getByLabelText('Transporte de material sensível'));
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar Solicitação' }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ material_sensivel: true })));
  });
});
