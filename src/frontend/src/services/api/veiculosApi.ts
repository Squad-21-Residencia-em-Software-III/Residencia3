import type {
  NovoVeiculoInput,
  OcupacaoVeiculoSvo,
  Veiculo,
  VeiculoSvoDisponivel,
} from '../../types/veiculo';
import { request } from './http';

export const veiculosApi = {
  listar: () => request<Veiculo[]>('GET', '/veiculos'),

  listarOcupacaoSvo: () => request<OcupacaoVeiculoSvo[]>('GET', '/veiculos/svo/ocupacao'),

  // Veículos SVO que a API considera elegíveis à alocação (BL28)
  listarSvoDisponiveis: () =>
    request<VeiculoSvoDisponivel[]>('GET', '/veiculos/svo/disponiveis'),

  criar: (dados: NovoVeiculoInput) => request<Veiculo>('POST', '/veiculos', { body: dados }),

  atualizar: (id: number, dados: Partial<NovoVeiculoInput>) =>
    request<Veiculo>('PUT', `/veiculos/${id}`, { body: dados }),
};
