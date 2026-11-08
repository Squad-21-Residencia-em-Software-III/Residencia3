
import {
  auditoriaModel,
  type Auditoria,
} from '../models/auditoriaModel';

export const auditoriaService = {
  async listar(): Promise<Auditoria[]> {
    return auditoriaModel.listar();
  },
};
