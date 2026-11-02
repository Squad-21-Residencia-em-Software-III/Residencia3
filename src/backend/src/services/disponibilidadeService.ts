
import { db } from '../config/database';
import { AppError } from '../errors/AppError';

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

    // 3. Verificar se existe data de chegada
    if (!solicitacao.data_chegada_desejada) {
      throw new AppError(
        'A solicitação precisa ter uma data de chegada para consultar a disponibilidade',
        400
      );
    }

    // 4. Validar o período solicitado
    const inicio = new Date(solicitacao.data_saida_desejada);
    const fim = new Date(solicitacao.data_chegada_desejada);

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

    // Considerar a data de chegada no horário de Brasília
    const partesData = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(fim);

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

    // 5. Consultar veículos disponíveis
    const veiculosDisponiveis = await db('veiculos as v')
      .select(
        'v.id',
        'v.placa',
        'v.modelo',
        'v.capacidade_maxima',
        'v.status'
      )
      .where('v.tipo_frota', 'ADMINISTRATIVA')
      .whereNotIn('v.status', [
        'MANUTENCAO',
        'EM_USO',
      ])
      .whereNotExists(function () {
        this.select(db.raw('1'))
          .from('viagens_frota as vf')
          .join(
            'solicitacoes_viagem as sv',
            'sv.id',
            'vf.solicitacao_id'
          )
          .whereRaw('vf.veiculo_id = v.id')
          .whereIn('vf.status', [
            'AGENDADA',
            'EM_ANDAMENTO',
          ])
          .where('sv.data_saida_desejada', '<', fim)
          .where('sv.data_chegada_desejada', '>', inicio);
      })
      .orderBy('v.id', 'asc');

    // 6. Consultar motoristas disponíveis
    const motoristasDisponiveis = await db('motoristas as m')
      .select(
        'm.id',
        'm.usuario_id',
        'm.categoria_cnh',
        'm.validade_cnh',
        'm.status'
      )
      .where('m.tipo_motorista', 'FROTA')
      .whereNotIn('m.status', [
        'INATIVO',
        'AFASTADO',
        'EM_VIAGEM',
      ])
      .where('m.validade_cnh', '>=', dataFimBrasil)
      .whereNotExists(function () {
        this.select(db.raw('1'))
          .from('viagens_frota as vf')
          .join(
            'solicitacoes_viagem as sv',
            'sv.id',
            'vf.solicitacao_id'
          )
          .whereRaw('vf.motorista_id = m.id')
          .whereIn('vf.status', [
            'AGENDADA',
            'EM_ANDAMENTO',
          ])
          .where('sv.data_saida_desejada', '<', fim)
          .where('sv.data_chegada_desejada', '>', inicio);
      })
      .orderBy('m.id', 'asc');

    // 7. Retornar os recursos disponíveis
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
