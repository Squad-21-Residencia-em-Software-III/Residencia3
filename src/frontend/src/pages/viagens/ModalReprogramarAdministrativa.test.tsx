import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { viagensApi } from '../../services/api/viagensApi';
import type { Viagem } from '../../types/viagem';
import { ModalReprogramarAdministrativa, podeReprogramarAdministrativa } from './ModalReprogramarAdministrativa';

vi.mock('../../services/api/viagensApi', () => ({ viagensApi: { reprogramarAdministrativa: vi.fn() } }));
const api = vi.mocked(viagensApi.reprogramarAdministrativa);
const viagem = { id: 3, solicitacao_id: 7, tipo_operacao: 'ADMINISTRATIVA', status: 'AGENDADA',
  pode_reprogramar: true, versao_programacao: 0, inicio_solicitado: '2099-01-12T08:00:00.000Z',
  fim_solicitado: '2099-01-12T10:00:00.000Z', inicio_previsto: '2099-01-12T08:00:00.000Z',
  fim_previsto: '2099-01-12T10:00:00.000Z', motorista_nome: 'Condutor', veiculo_placa: 'ABC1D23' } as Viagem;
function abrir() {
  const onSalva = vi.fn(); const onClose = vi.fn();
  render(<ModalReprogramarAdministrativa viagem={viagem} onClose={onClose} onSalva={onSalva} />);
  return { onSalva, onClose };
}
const confirmar = () => screen.getByRole('button', { name: 'Confirmar reprogramação' });
function alterar() {
  fireEvent.change(screen.getByLabelText('Novo início planejado'), { target: { value: '2099-01-13T08:00' } });
  fireEvent.change(screen.getByLabelText('Novo término planejado'), { target: { value: '2099-01-13T10:00' } });
}
describe('A6 interface administrativa', () => {
  beforeEach(() => { api.mockReset(); api.mockResolvedValue(viagem); });
  it('restringe ação por perfil, permissão do backend, estado e operação', () => {
    expect(podeReprogramarAdministrativa(viagem, true)).toBe(true);
    expect(podeReprogramarAdministrativa(viagem, false)).toBe(false);
    expect(podeReprogramarAdministrativa({ ...viagem, pode_reprogramar: false }, true)).toBe(false);
    expect(podeReprogramarAdministrativa({ ...viagem, status: 'EM_ANDAMENTO' }, true)).toBe(false);
    expect(podeReprogramarAdministrativa({ ...viagem, tipo_operacao: 'SVO' }, true)).toBe(false);
  });
  it('exibe as datas distintas e envia período, versão e identidade; confirma atualização', async () => {
    const { onSalva } = abrir(); expect(screen.getByText(/^Solicitado:/)).toBeTruthy(); expect(screen.getByText(/^Planejado atual:/)).toBeTruthy();
    alterar(); fireEvent.click(confirmar());
    await waitFor(() => expect(onSalva).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith(3, { inicio_previsto: new Date('2099-01-13T08:00').toISOString(), fim_previsto: new Date('2099-01-13T10:00').toISOString(), versao_programacao: 0, chave_idempotencia: expect.any(String) });
  });
  it('não envia intervalo inválido', async () => {
    abrir(); alterar(); fireEvent.change(screen.getByLabelText('Novo término planejado'), { target: { value: '2099-01-13T07:00' } });
    fireEvent.submit(confirmar().closest('form')!); expect(await screen.findByText('O término planejado deve ser posterior ao início.')).toBeTruthy(); expect(api).not.toHaveBeenCalled();
  });
  it('bloqueia envio duplo e mantém identidade após falha', async () => {
    let rejeitar!: (e: Error) => void;
    api.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejeitar = reject; }));
    const { onSalva } = abrir(); alterar(); const form = confirmar().closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form); expect(api).toHaveBeenCalledTimes(1);
    rejeitar(new Error('Conflito de agenda'));
    await waitFor(() => expect(confirmar()).toBeTruthy());
    expect(onSalva).not.toHaveBeenCalled(); fireEvent.click(confirmar());
    await waitFor(() => expect(onSalva).toHaveBeenCalledTimes(1)); expect(api.mock.calls[1][1]).toEqual(api.mock.calls[0][1]);
  });
});
