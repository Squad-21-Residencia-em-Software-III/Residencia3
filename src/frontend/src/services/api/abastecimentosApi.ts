import { request } from './http';
import type { Abastecimento } from '../../types/abastecimento';

export interface CriarAbastecimentoPayload {
  veiculo_id: number;
  motorista_id: number;
  data_abastecimento: string;
  quilometragem: number;
  litros: number;
  valor_total: number;
  posto_combustivel: string;
}

export const abastecimentosApi = {
  criar: (dados: CriarAbastecimentoPayload) => {
    // Sanitização para garantir estrita conformidade com o Zod .strict()
    const payload: CriarAbastecimentoPayload = {
      veiculo_id: Number(dados.veiculo_id),
      motorista_id: Number(dados.motorista_id),
      data_abastecimento: String(dados.data_abastecimento).slice(0, 10),
      quilometragem: Math.round(Number(dados.quilometragem)),
      litros: Number(dados.litros),
      valor_total: Number(dados.valor_total),
      posto_combustivel: String(dados.posto_combustivel).trim(),
    };
    return request<Abastecimento>('POST', '/abastecimentos', { body: payload });
  },

  listarPorVeiculo: (veiculoId: number) =>
    request<Abastecimento[]>('GET', `/abastecimentos/veiculo/${veiculoId}`),

  listarTodos: async (veiculosIds: number[]): Promise<Abastecimento[]> => {
    if (!veiculosIds.length) return [];
    const resultados = await Promise.all(
      veiculosIds.map((id) =>
        abastecimentosApi.listarPorVeiculo(id).catch(() => [] as Abastecimento[]),
      ),
    );
    const todos = resultados.flat();
    return todos.sort((a, b) => new Date(b.data_abastecimento).getTime() - new Date(a.data_abastecimento).getTime());
  },
};

