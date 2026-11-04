import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import {
  auditoriaModel,
  MODULOS_AUDITORIA,
} from '../models/auditoriaModel';
import {
  solicitacaoViagemModel,
  type SolicitacaoViagem,
} from '../models/solicitacaoViagemModel';
import type {
  CriarSolicitacaoViagemInput,
} from '../validators/solicitacaoViagemSchemas';

export const solicitacaoViagemService = {
  async criar(
    dados: CriarSolicitacaoViagemInput,
    solicitanteId: number
  ): Promise<SolicitacaoViagem> {

    const dataSaida = new Date(dados.data_saida_desejada);

    if (dataSaida.getTime() <= Date.now()) {
      throw new AppError(
        'A data de saída deve ser futura',
        400
      );
    }

    if (dados.data_chegada_desejada) {
      const dataChegada = new Date(
        dados.data_chegada_desejada
      );

      if (dataChegada.getTime() <= dataSaida.getTime()) {
        throw new AppError(
          'A data de chegada deve ser posterior à saída',
          400
        );
      }
    }

    return db.transaction(async (trx) => {
      const solicitacao =
        await solicitacaoViagemModel.cadastrar(
          {
            ...dados,
            solicitante_id: solicitanteId,
          },
          trx
        );

      await auditoriaModel.registrar(
        {
          usuario_id: solicitanteId,
          acao: `CRIOU_SOLICITACAO_VIAGEM id=${solicitacao.id}`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_VIAGEM,
        },
        trx
      );

      return solicitacao;
    });
  },

  async aprovar(
    id: number,
    autorId: number
  ): Promise<SolicitacaoViagem> {
    return analisar(id, 'APROVADA', autorId);
  },

  async recusar(
    id: number,
    autorId: number,
    motivo?: string
  ): Promise<SolicitacaoViagem> {
    return analisar(id, 'RECUSADA', autorId, motivo);
  },
};

// Aprova ou recusa uma solicitação pendente
async function analisar(
  id: number,
  novoStatus: 'APROVADA' | 'RECUSADA',
  autorId: number,
  motivo?: string
): Promise<SolicitacaoViagem> {
  return db.transaction(async (trx) => {
    const solicitacao =
      await solicitacaoViagemModel.buscarParaAtualizar(id, trx);

    if (!solicitacao) {
      throw new AppError(
        'Solicitação de viagem não encontrada',
        404
      );
    }

    if (solicitacao.status !== 'PENDENTE_APROVACAO') {
      throw new AppError(
        'Apenas solicitações pendentes podem ser aprovadas ou recusadas',
        400
      );
    }

    const saidaJaPassou =
      new Date(solicitacao.data_saida_desejada).getTime() <= Date.now();

    if (novoStatus === 'APROVADA' && saidaJaPassou) {
      throw new AppError(
        'Não é possível aprovar: a data de saída já passou',
        400
      );
    }

    const motivoRecusa = novoStatus === 'RECUSADA' ? (motivo ?? null) : null;

    const atualizada =
      await solicitacaoViagemModel.atualizarStatus(id, novoStatus, trx, motivoRecusa);

    // O motivo da recusa fica registrado na coluna motivo_recusa e na auditoria
    const acao = novoStatus === 'APROVADA'
      ? `APROVOU_SOLICITACAO_VIAGEM id=${id}`
      : `RECUSOU_SOLICITACAO_VIAGEM id=${id}${motivo ? ` motivo="${motivo}"` : ''}`;

    await auditoriaModel.registrar(
      {
        usuario_id: autorId,
        acao,
        modulo: MODULOS_AUDITORIA.SOLICITACOES_VIAGEM,
      },
      trx
    );

    return atualizada;
  });
}