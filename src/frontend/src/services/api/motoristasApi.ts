import type {
  AtualizarMotoristaInput,
  CriarMotoristaInput,
  Motorista,
  MotoristaComCnh,
  MotoristaDetalhe,
  UsuarioElegivel,
} from '../../types/motorista';
import { request } from './http';

export const motoristasApi = {
  listar: () => request<Motorista[]>('GET', '/motoristas'),
  buscarMeuPerfil: () => request<MotoristaComCnh>('GET', '/motoristas/me'),
  // SCRUM-308 (atrás de RECURSOS_BACKEND.escritaMotoristas)
  listarUsuariosElegiveis: () => request<UsuarioElegivel[]>('GET', '/motoristas/usuarios-elegiveis'),
  buscar: (id: number) => request<MotoristaDetalhe>('GET', `/motoristas/${id}`),
  criar: (dados: CriarMotoristaInput) => request<MotoristaDetalhe>('POST', '/motoristas', { body: dados }),
  atualizar: (id: number, dados: AtualizarMotoristaInput) =>
    request<MotoristaDetalhe>('PATCH', `/motoristas/${id}`, { body: dados }),
};
