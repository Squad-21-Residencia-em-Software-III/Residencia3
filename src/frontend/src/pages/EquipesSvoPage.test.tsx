import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { equipesSvoApi } from '../services/api/equipesSvoApi';
import EquipesSvoPage from './EquipesSvoPage';

vi.mock('../services/api/equipesSvoApi', () => ({ equipesSvoApi: { listar: vi.fn(), criar: vi.fn(), atualizar: vi.fn() } }));

describe('Equipes SVO', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(equipesSvoApi.listar).mockResolvedValue([]); });
  it('carrega lista e cadastra equipe', async () => {
    vi.mocked(equipesSvoApi.criar).mockResolvedValue({ id: 3, nome_equipe: 'Alfa' });
    render(<EquipesSvoPage />);
    expect(await screen.findByText('Nenhuma equipe cadastrada.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nome da equipe'), 'Alfa');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar equipe' }));
    expect(await screen.findByText('#3 Alfa')).toBeInTheDocument();
    expect(equipesSvoApi.criar).toHaveBeenCalledWith('Alfa');
  });
  it('permite editar equipe existente', async () => {
    vi.mocked(equipesSvoApi.listar).mockResolvedValue([{ id: 3, nome_equipe: 'Alfa' }]);
    vi.mocked(equipesSvoApi.atualizar).mockResolvedValue({ id: 3, nome_equipe: 'Beta' });
    render(<EquipesSvoPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Alfa' }));
    await userEvent.clear(screen.getByLabelText('Nome da equipe'));
    await userEvent.type(screen.getByLabelText('Nome da equipe'), 'Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('#3 Beta')).toBeInTheDocument();
    expect(equipesSvoApi.atualizar).toHaveBeenCalledWith(3, 'Beta');
  });
  it('exibe falha da API', async () => {
    vi.mocked(equipesSvoApi.listar).mockRejectedValue(new Error('Falha ao carregar'));
    render(<EquipesSvoPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar');
  });
});
