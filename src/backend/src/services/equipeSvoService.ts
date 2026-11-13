
import { db } from '../config/database';
import type { ConsultarDisponibilidadeEquipesInput } from '../validators/equipeSvoSchemas';

// Ordens que indicam uma equipe ocupada
const ORDENS_OCUPANDO_EQUIPE = ['ALOCADA', 'EM_DESLOCAMENTO'];

export const equipeSvoService = {
  async consultarDisponibilidade(
    filtros: ConsultarDisponibilidadeEquipesInput
  ) {
    const inicio = new Date(filtros.inicio);
    const fim = new Date(filtros.fim);

    const equipes = await db('equipes_svo as e')
      .select('e.id', 'e.nome_equipe')
      .whereExists(
        db('escalas_svo as es')
          .select(db.raw('1'))
          .whereRaw('es.equipe_id = e.id')
          .where('es.data_inicio', '<=', inicio)
          .where('es.data_fim', '>=', fim)
      )
      .whereNotExists(
        db('ordens_svo as o')
          .select(db.raw('1'))
          .whereRaw('o.equipe_id = e.id')
          .whereIn('o.status', ORDENS_OCUPANDO_EQUIPE)
      )
      .orderBy('e.id', 'asc');

    return {
      periodo: { inicio, fim },
      equipes,
    };
  },
};
