import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { request } from '../services/api/http';
import MinhasColetasSvoPage from './MinhasColetasSvoPage';

vi.mock('../services/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/api/http')>()),
  request: vi.fn(),
}));

it('mantém a mesma coleta visível e somente para consulta após a chegada ao local', async () => {
  const coleta = {
    id: 24, origem: 'Local da ocorrência', motorista_nome: 'Motorista SVO',
    veiculo_modelo: 'Veículo SVO', veiculo_placa: 'ABC1D23',
    inicio_previsto: null, fim_previsto: null, data_hora_saida: '2099-01-01T09:00:00Z', data_hora_conclusao: null,
  };
  const resposta = (status: string) => ({ dados: [{ ...coleta, status }], paginacao: { pagina: 1, totalPaginas: 1 } });
  vi.mocked(request).mockResolvedValueOnce(resposta('EM_DESLOCAMENTO')).mockResolvedValueOnce(resposta('NO_LOCAL'));

  const primeira = render(<MinhasColetasSvoPage />);
  expect(await screen.findByRole('heading', { name: /Coleta #24.*Em deslocamento/ })).toBeInTheDocument();
  primeira.unmount();
  render(<MinhasColetasSvoPage />);
  expect(await screen.findByRole('heading', { name: /Coleta #24.*No local/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /iniciar|chegar|finalizar|reagendar/i })).not.toBeInTheDocument();
  expect(vi.mocked(request).mock.calls).toEqual(Array.from({ length: 2 }, () =>
    ['GET', '/viagens/coletas-svo/minhas', { query: { pagina: 1, limite: 20 } }]));
});
