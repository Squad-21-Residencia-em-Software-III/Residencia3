import { request } from './http';
import type { Manutencao, NovaManutencaoInput, StatusManutencao } from '../../types/manutencao';

export const manutencoesApi = {
  criar: (dados: NovaManutencaoInput) => {
    const payload = {
      veiculo_id: Number(dados.veiculo_id),
      fornecedor_id: dados.fornecedor_id ? Number(dados.fornecedor_id) : null,
      tipo_manutencao: dados.tipo_manutencao,
      data_manutencao: dados.data_manutencao,
      descricao: dados.descricao?.trim() || null,
      custo: dados.custo !== undefined && dados.custo !== null ? Number(dados.custo) : null,
      status: dados.status || 'AGENDADA',
    };
    return request<Manutencao>('POST', '/manutencoes', { body: payload });
  },

  atualizar: (id: number, dados: Partial<NovaManutencaoInput>) =>
    request<Manutencao>('PUT', `/manutencoes/${id}`, { body: dados }),

  atualizarStatus: (id: number, status: StatusManutencao) =>
    request<Manutencao>('PATCH', `/manutencoes/${id}/status`, { body: { status } }),

  excluir: (id: number) =>
    request<void>('DELETE', `/manutencoes/${id}`),

  listarPorVeiculo: (veiculoId: number) =>
    request<Manutencao[]>('GET', `/manutencoes/veiculo/${veiculoId}`),

  listarTodas: async (veiculosIds: number[]): Promise<Manutencao[]> => {
    if (!veiculosIds.length) return [];
    const resultados = await Promise.all(
      veiculosIds.map((id) =>
        manutencoesApi.listarPorVeiculo(id).catch(() => [] as Manutencao[]),
      ),
    );
    const todas = resultados.flat();
    return todas.sort((a, b) => new Date(b.data_manutencao).getTime() - new Date(a.data_manutencao).getTime());
  },
};
