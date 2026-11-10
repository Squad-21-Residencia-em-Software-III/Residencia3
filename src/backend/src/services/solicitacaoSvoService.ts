import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  solicitacaoSvoModel,
  type SolicitacaoSvo,
  type StatusSolicitacaoSvo,
} from '../models/solicitacaoSvoModel';
import type { CriarSolicitacaoSvoInput } from '../validators/solicitacaoSvoSchemas';

export const solicitacaoSvoService = {
  // Toda solicitação nasce em triagem, registrada pelo usuário autenticado
  async registrar(dados: CriarSolicitacaoSvoInput, registranteId: number): Promise<SolicitacaoSvo> {
    return db.transaction(async (trx) => {
      const solicitacao = await solicitacaoSvoModel.cadastrar(
        {
          registrante_id: registranteId,
          dados_solicitante: dados.dados_solicitante,
          local_ocorrencia: dados.local_ocorrencia,
          material_sensivel: dados.material_sensivel,
          status: 'EM_TRIAGEM',
        },
        trx,
      );

      await auditoriaModel.registrar(
        {
          usuario_id: registranteId,
          acao: `Solicitação SVO ${solicitacao.id} registrada para triagem`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_SVO,
        },
        trx,
      );

      return solicitacao;
    });
  },

  async listar(status?: StatusSolicitacaoSvo): Promise<SolicitacaoSvo[]> {
    return solicitacaoSvoModel.listar(status);
  },

  async buscarPorId(id: number): Promise<SolicitacaoSvo> {
    const solicitacao = await solicitacaoSvoModel.buscarPorId(id);
    if (!solicitacao) {
      throw new AppError('Solicitação SVO não encontrada', 404);
    }
    return solicitacao;
  },
};
