import { db } from '../config/database';
import type { ConsultarDisponibilidadeEquipesInput } from '../validators/equipeSvoSchemas';

// Ordens que indicam uma equipe ocupada no momento operacional atual
const ORDENS_OCUPANDO_EQUIPE = ['ALOCADA', 'EM_DESLOCAMENTO'];

// Tolerância para consultas operacionais imediatas (compensa latência de rede e diferença de relógio)
const TOLERANCIA_CONSULTA_IMEDIATA_MS = 15 * 60 * 1000;

function criarErroPeriodoNaoSuportado(mensagem: string): Error & {
  statusCode: number;
  status: number;
} {
  return Object.assign(new Error(mensagem), {
    name: 'PeriodoNaoSuportadoError',
    statusCode: 400,
    status: 400,
  });
}

export const equipeSvoService = {
  /**
   * Consulta equipes SVO disponíveis para atendimento operacional imediato.
   *
   * Contrato temporal (SCRUM-104 / BL29):
   * - Como ordens ALOCADA/EM_DESLOCAMENTO ainda não possuem previsão de término (escopo SCRUM-166),
   *   a consulta suporta exclusivamente o período operacional imediato (`inicio` próximo ao horário atual).
   * - Consultas de períodos futuros ou passados fora da tolerância operacional são rejeitadas.
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

    const diferencaParaAgoraMs = Math.abs(inicio.getTime() - agora.getTime());
    if (diferencaParaAgoraMs > TOLERANCIA_CONSULTA_IMEDIATA_MS) {
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