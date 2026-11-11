import { request } from './http';
import type { Multa, NovaMultaInput } from '../../types/multa';

export const multasApi = {
  listar: () => request<Multa[]>('GET', '/multas'),

  criar: (dados: NovaMultaInput) => {
    const payload = {
      veiculo_id: Number(dados.veiculo_id),
      motorista_id: dados.motorista_id ? Number(dados.motorista_id) : null,
      data_infracao: dados.data_infracao,
      valor: Number(dados.valor),
      pontos: Math.max(0, Math.round(Number(dados.pontos))),
      status_pagamento: dados.status_pagamento || 'PENDENTE',
      data_vencimento: dados.data_vencimento || null,
      id_infracao: dados.id_infracao?.trim() || null,
      orgao_autuador: dados.orgao_autuador?.trim() || null,
      descricao: dados.descricao?.trim() || null,
    };
    return request<Multa>('POST', '/multas', { body: payload });
  },

  atualizar: (id: number, dados: Partial<NovaMultaInput>) =>
    request<Multa>('PUT', `/multas/${id}`, { body: dados }),

  excluir: (id: number) =>
    request<void>('DELETE', `/multas/${id}`),
};
