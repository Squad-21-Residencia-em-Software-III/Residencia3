
import type { Knex } from 'knex';
import { db } from '../config/database';
import { AppError } from '../errors/AppError';

// Status de viagem que ocupam o veículo e o motorista
const STATUS_VIAGEM_ATIVA = ['AGENDADA', 'EM_ANDAMENTO'];

// Status que deixam o recurso indisponível em qualquer período
export const STATUS_VEICULO_BLOQUEADO = ['MANUTENCAO'];
export const STATUS_MOTORISTA_BLOQUEADO = ['INATIVO', 'AFASTADO'];

// Sem data de chegada, a viagem ocupa até o fim do dia da saída
const FIM_VIAGEM_SQL =
  "COALESCE(sv.data_chegada_desejada, date_trunc('day', sv.data_saida_desejada) + interval '1 day')";

interface SolicitacaoComPeriodo {
  data_saida_desejada: Date | string;
  data_chegada_desejada?: Date | string | null;
}

// Calcula o período ocupado por uma solicitação
export function periodoDaSolicitacao(solicitacao: SolicitacaoComPeriodo) {
  const inicio = new Date(solicitacao.data_saida_desejada);

  // Mesma regra de FIM_VIAGEM_SQL: sem chegada, vai até o fim do dia da saída
  const fim = solicitacao.data_chegada_desejada
    ? new Date(solicitacao.data_chegada_desejada)
    : new Date(
        inicio.getFullYear(),
        inicio.getMonth(),
        inicio.getDate() + 1
      );

  if (
    Number.isNaN(inicio.getTime()) ||
    Number.isNaN(fim.getTime()) ||
    fim.getTime() <= inicio.getTime()
  ) {
    throw new AppError(
      'Período da solicitação inválido',
      400
    );
  }

  return { inicio, fim };
}

// Viagens agendadas ou em andamento que se sobrepõem ao período
export function viagensConflitantes(
  conexao: Knex | Knex.Transaction,
  inicio: Date,
  fim: Date
) {
  return conexao('viagens_frota as vf')
    .join(
      'solicitacoes_viagem as sv',
      'sv.id',
      'vf.solicitacao_id'
    )
    .whereIn('vf.status', STATUS_VIAGEM_ATIVA)
    .where('sv.data_saida_desejada', '<', fim)
    .whereRaw(`${FIM_VIAGEM_SQL} > ?`, [inicio]);
}

export const disponibilidadeService = {
  async consultar(solicitacaoId: number) {
    // 1. Validar o ID da solicitação
    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0) {
      throw new AppError('ID da solicitação inválido', 400);
    }

    // 2. Buscar a solicitação
    const solicitacao = await db('solicitacoes_viagem')
      .where({ id: solicitacaoId })
      .first();

    if (!solicitacao) {
      throw new AppError(
        'Solicitação de viagem não encontrada',
        404
      );
    }

    // 3. Calcular e validar o período solicitado
    const { inicio, fim } = periodoDaSolicitacao(solicitacao);

    // Considerar o último dia da viagem no horário de Brasília
    const partesData = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(
      new Date(
        solicitacao.data_chegada_desejada ??
          solicitacao.data_saida_desejada
      )
    );

    const ano = partesData.find(
      (parte) => parte.type === 'year'
    )?.value;

    const mes = partesData.find(
      (parte) => parte.type === 'month'
    )?.value;

    const dia = partesData.find(
      (parte) => parte.type === 'day'
    )?.value;

    const dataFimBrasil = `${ano}-${mes}-${dia}`;

    // 4. Consultar veículos disponíveis no período
    const veiculosDisponiveis = await db('veiculos as v')
      .select(
        'v.id',
        'v.placa',
        'v.modelo',
        'v.capacidade_maxima',
        'v.status'
      )
      .where('v.tipo_frota', 'ADMINISTRATIVA')
      .whereNotIn('v.status', STATUS_VEICULO_BLOQUEADO)
      .whereNotExists(
        viagensConflitantes(db, inicio, fim)
          .select(db.raw('1'))
          .whereRaw('vf.veiculo_id = v.id')
      )
      .orderBy('v.id', 'asc');

    // 5. Consultar motoristas disponíveis no período
    const motoristasDisponiveis = await db('motoristas as m')
      .select(
        'm.id',
        'm.usuario_id',
        'm.categoria_cnh',
        'm.validade_cnh',
        'm.status'
      )
      .where('m.tipo_motorista', 'FROTA')
      .whereNotIn('m.status', STATUS_MOTORISTA_BLOQUEADO)
      .where('m.validade_cnh', '>=', dataFimBrasil)
      .whereNotExists(
        viagensConflitantes(db, inicio, fim)
          .select(db.raw('1'))
          .whereRaw('vf.motorista_id = m.id')
      )
      .orderBy('m.id', 'asc');

    // 6. Retornar os recursos disponíveis
    return {
      solicitacao_id: solicitacao.id,
      periodo: {
        inicio,
        fim,
      },
      veiculos_disponiveis: veiculosDisponiveis,
      motoristas_disponiveis: motoristasDisponiveis,
    };
  },
};
