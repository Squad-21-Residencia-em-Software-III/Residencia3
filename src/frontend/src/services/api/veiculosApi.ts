import type { NovoVeiculoInput, OcupacaoVeiculoSvo, Veiculo } from '../../types/veiculo';
import { request } from './http';

export const veiculosApi = {
  listar: () => request<Veiculo[]>('GET', '/veiculos'),

  listarOcupacaoSvo: () => request<OcupacaoVeiculoSvo[]>('GET', '/veiculos/svo/ocupacao'),

  criar: (dados: NovoVeiculoInput) => request<Veiculo>('POST', '/veiculos', { body: dados }),

  atualizar: (id: number, dados: Partial<NovoVeiculoInput>) =>
    request<Veiculo>('PUT', `/veiculos/${id}`, { body: dados }),
};
