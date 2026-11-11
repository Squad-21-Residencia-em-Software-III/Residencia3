import type { NovaViagemInput, Viagem } from '../../types/viagem'
import { request } from './http'

// Viagens administrativas e ordens SVO têm ids independentes: o tipo indica a tabela no backend
type ReferenciaViagem = Pick<Viagem, 'id' | 'tipo_operacao'>

export const viagensApi = {
  listar: () => request<Viagem[]>('GET', '/viagens'),

  criar: (dados: NovaViagemInput) => request<Viagem>('POST', '/viagens', { body: dados }),

  iniciar: ({ id, tipo_operacao }: ReferenciaViagem, km_inicial: number) =>
    request<Viagem>('PATCH', `/viagens/${id}/iniciar`, { body: { tipo_operacao, km_inicial } }),

  finalizar: ({ id, tipo_operacao }: ReferenciaViagem, km_final: number) =>
    request<Viagem>('PATCH', `/viagens/${id}/finalizar`, { body: { tipo_operacao, km_final } }),

  cancelar: ({ id, tipo_operacao }: ReferenciaViagem) =>
    request<Viagem>('PATCH', `/viagens/${id}/cancelar`, { body: { tipo_operacao } }),
}
