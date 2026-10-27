
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
          modulo: MODULOS_AUDITORIA.VEICULOS ?? 'VEICULOS',
        },
        trx
      );

      return solicitacao;
    });
  },
};
