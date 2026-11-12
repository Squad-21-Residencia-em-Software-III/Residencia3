import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  solicitacaoSvoModel,
  type SolicitacaoSvo,

} from '../models/solicitacaoSvoModel';
import type { CriarSolicitacaoSvoInput, ListarSolicitacoesSvoInput } from '../validators/solicitacaoSvoSchemas';
import type { ListaPaginada } from './usuarioService';

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
          acao: `CRIOU_SOLICITACAO_SVO id=${solicitacao.id}`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_SVO,
        },
        trx,
      );

      return solicitacao;
    });
  },

  async listar(filtros: ListarSolicitacoesSvoInput): Promise<ListaPaginada<SolicitacaoSvo>> {
    const { dados, total } = await solicitacaoSvoModel.listar(filtros);

    return {
      dados,
      paginacao: {
        pagina: filtros.pagina,
        limite: filtros.limite,
        total,
        totalPaginas: Math.ceil(total / filtros.limite),
      },
    };
  },

  async buscarPorId(id: number): Promise<SolicitacaoSvo> {
    const solicitacao = await solicitacaoSvoModel.buscarPorId(id);
    if (!solicitacao) {
      throw new AppError('Solicitação SVO não encontrada', 404);
    }
    return solicitacao;
  },
};
