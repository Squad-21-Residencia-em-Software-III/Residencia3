import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { equipesSvoApi } from '../services/api/equipesSvoApi';
import { IntegrantesSvo } from './IntegrantesSvo';

vi.mock('../services/api/equipesSvoApi', () => ({ equipesSvoApi: {
  integrantes: vi.fn(), integrantesEquipe: vi.fn(), criarIntegrante: vi.fn(), vincular: vi.fn(), desvincular: vi.fn(),
} }));

describe('gestão de integrantes SVO', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(equipesSvoApi.integrantes).mockResolvedValue([{ id: 7, nome: 'Maria', email: 'maria@exemplo.com' }]);
    vi.mocked(equipesSvoApi.integrantesEquipe).mockResolvedValue([]);
  });
  it('vincula um integrante existente à equipe selecionada', async () => {
    vi.mocked(equipesSvoApi.vincular).mockResolvedValue(undefined);
    render(<IntegrantesSvo equipes={[{ id: 3, nome_equipe: 'Alfa' }]} />);
    await userEvent.selectOptions(screen.getByLabelText('Equipe'), '3');
    await screen.findByRole('option', { name: 'Maria' });
    await userEvent.selectOptions(await screen.findByLabelText('Integrante para vincular'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(equipesSvoApi.vincular).toHaveBeenCalledWith(3, 7);
  });
  it('envia apenas os campos aprovados para criar integrante', async () => {
    vi.mocked(equipesSvoApi.criarIntegrante).mockResolvedValue({ id: 7, nome: 'Maria Silva', email: 'maria@exemplo.com' });
    render(<IntegrantesSvo equipes={[]} />);
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Maria Silva');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@exemplo.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha123');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar integrante' }));
    expect(equipesSvoApi.criarIntegrante).toHaveBeenCalledWith({ nome: 'Maria Silva', email: 'maria@exemplo.com', senha: 'Senha123' });
  });
});
