import type { Request, Response } from 'express';
import { solicitacaoSvoExternaService } from '../services/solicitacaoSvoExternaService';
import {
  CABECALHO_CHAVE_IDEMPOTENCIA,
  CABECALHO_PROVA_TENTATIVA,
  cabecalhosCriacaoExternaSchema,
  solicitacaoSvoExternaSchema,
} from '../validators/solicitacaoSvoExternaSchemas';

export const solicitacaoSvoExternaController = {
  // Rota pública: sem usuário autenticado. Canal e registrante são definidos pelo servidor.
  async criar(req: Request, res: Response): Promise<void> {
    const cabecalhos = cabecalhosCriacaoExternaSchema.parse({
      [CABECALHO_CHAVE_IDEMPOTENCIA]: req.get(CABECALHO_CHAVE_IDEMPOTENCIA),
      [CABECALHO_PROVA_TENTATIVA]: req.get(CABECALHO_PROVA_TENTATIVA),
    });
    const dados = solicitacaoSvoExternaSchema.parse(req.body ?? {});

    const resultado = await solicitacaoSvoExternaService.registrar(dados, {
      chaveIdempotencia: cabecalhos[CABECALHO_CHAVE_IDEMPOTENCIA],
      provaTentativa: cabecalhos[CABECALHO_PROVA_TENTATIVA],
    });

    // Resposta mínima: a credencial só aparece aqui e nunca é guardada em texto claro
    res
      .status(resultado.criada ? 201 : 200)
      .set('Cache-Control', 'no-store')
      .json({
        protocolo: resultado.protocolo,
        credencial: resultado.credencial,
        status: 'RECEBIDA',
        status_label: 'Recebida',
        registrada_em: resultado.registradaEm,
      });
  },
};
