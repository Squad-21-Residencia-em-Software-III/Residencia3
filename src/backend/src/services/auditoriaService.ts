
import {
  auditoriaModel,
  type Auditoria,
} from '../models/auditoriaModel';

export interface ListaAuditoriasPaginada {
  dados: Auditoria[];
  paginacao: {
    pagina: number;
    limite: number;
    total: number;
    totalPaginas: number;
  };
}

export const auditoriaService = {
  async listar(
    pagina = 1,
    limite = 20
  ): Promise<ListaAuditoriasPaginada> {
    const { dados, total } = await auditoriaModel.listar(pagina, limite);

    return {
      dados,
      paginacao: {
        pagina,
        limite,
        total,
        totalPaginas: Math.ceil(total / limite),
      },
    };
  },
};
