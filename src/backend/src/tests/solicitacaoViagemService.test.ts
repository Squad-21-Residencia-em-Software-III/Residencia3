
import { describe, it, expect } from 'vitest';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';

describe('Solicitação de viagem - regras de datas', () => {
  it('deve rejeitar data de saída no passado', async () => {
    const dados = {
      origem: 'Aracaju',
      destino: 'Itabaiana',
      finalidade: 'Visita técnica',
      data_saida_desejada: '2020-01-01T08:00:00-03:00',
    };

    await expect(
      solicitacaoViagemService.criar(dados, 1)
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('deve rejeitar chegada anterior à saída', async () => {
    const dados = {
      origem: 'Aracaju',
      destino: 'Itabaiana',
      finalidade: 'Visita técnica',
      data_saida_desejada: '2099-12-10T08:00:00-03:00',
      data_chegada_desejada: '2099-12-09T17:00:00-03:00',
    };

    await expect(
      solicitacaoViagemService.criar(dados, 1)
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
