
import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import type { ConsultarDisponibilidadeEquipesInput } from '../validators/equipeSvoSchemas';

// Ordens que indicam uma equipe ocupada no momento operacional atual
const ORDENS_OCUPANDO_EQUIPE = ['ALOCADA', 'EM_DESLOCAMENTO'];

// Janela técnica de observação, não uma duração estimada de coleta.
// O resultado representa somente a situação operacional consultada.
const JANELA_CONSULTA_IMEDIATA_MS = 60 * 1000;

function criarErroPeriodoNaoSuportado(mensagem: string): AppError {
  return new AppError(mensagem, 400);
}

export const equipeSvoService = {
  /**
   * Consulta a disponibilidade operacional atual das equipes SVO.
   *
   * A consulta usa uma janela técnica próxima ao horário do servidor.
   * Não representa reserva nem garantia de disponibilidade futura.
   * Agendamento e validação definitiva da alocação pertencem
   * às tarefas específicas SCRUM-166 e SCRUM-105.
   */
  async consultarDisponibilidade(
    filtros: ConsultarDisponibilidadeEquipesInput
  ) {
    const inicio = new Date(filtros.inicio);
    const fim = new Date(filtros.fim);
    const agora = new Date();

    if (
      Number.isNaN(inicio.getTime()) ||
      Number.isNaN(fim.getTime()) ||
      inicio >= fim
    ) {
      throw criarErroPeriodoNaoSuportado(
        'Período inválido: a data de início deve ser anterior à data de fim.'
      );
    }

    const limiteInferior = agora.getTime() - JANELA_CONSULTA_IMEDIATA_MS;
    const limiteSuperior = agora.getTime() + JANELA_CONSULTA_IMEDIATA_MS;

    if (
      inicio.getTime() < limiteInferior ||
      inicio.getTime() > agora.getTime() ||
      fim.getTime() <= agora.getTime() ||
      fim.getTime() > limiteSuperior
    ) {
      throw criarErroPeriodoNaoSuportado(
        'Período não suportado: a consulta de disponibilidade atende apenas à operação imediata.'
      );
    }

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
