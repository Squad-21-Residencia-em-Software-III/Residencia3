import type { NovoVeiculoInput, Veiculo } from '../../types/veiculo'
import { request } from './http'

export const veiculosApi = {
  listar: () => request<Veiculo[]>('GET', '/veiculos'),

  criar: (dados: NovoVeiculoInput) => request<Veiculo>('POST', '/veiculos', { body: dados }),
}
