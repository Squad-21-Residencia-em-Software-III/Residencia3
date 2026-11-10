import { motoristaModel, type MotoristaComNome } from '../models/motoristaModel';
import type { ListarMotoristasFiltros } from '../validators/motoristaSchemas';

export const motoristaService = {
  async listar(filtros: ListarMotoristasFiltros): Promise<MotoristaComNome[]> {
    return motoristaModel.listar(filtros);
  },

  async buscarPorUsuarioId(usuarioId: number): Promise<MotoristaComNome | undefined> {
    return motoristaModel.buscarPorUsuarioId(usuarioId);
  },
};
