import { db } from '../config/database';
import { acompanhamentoExternoSvoModel } from '../models/acompanhamentoExternoSvoModel';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { solicitacaoSvoExternaModel } from '../models/solicitacaoSvoExternaModel';
import type { CriarSolicitacaoSvoExternaInput } from '../validators/solicitacaoSvoExternaSchemas';
import {
  acompanhamentoExternoSvoService,
  gerarProtocoloExternoSvo,
} from './acompanhamentoExternoSvoService';
import { notificacaoSvoService } from './notificacaoSvoService';

export interface TentativaCriacaoExterna {
  chaveIdempotencia: string;
  provaTentativa: string;
}

export interface ResultadoCriacaoExterna {
  /** true: chamado criado agora; false: resposta perdida recuperada dentro da janela autorizada */
  criada: boolean;
  protocolo: string;
  credencial: string;
  registradaEm: string;
}

const VIOLACAO_UNIQUE_POSTGRES = '23505';
const TENTATIVAS_DE_PROTOCOLO = 3;

export const solicitacaoSvoExternaService = {
  /**
   * Registra a solicitação do cidadão e só devolve o protocolo depois do commit.
   * Na mesma transação: chamado (canal EXTERNA, sem registrante), dados protegidos, credencial
   * (emitida pelo serviço da SCRUM-266), auditoria sem dado pessoal e o aviso S1 (sem S2).
   *
   * Chave de idempotência já existente NÃO cria outro chamado. Só quem prova a posse da tentativa recebe
   * resposta: dentro da janela de recuperação (15 min) devolve o mesmo protocolo e a mesma credencial
   * (200); payload divergente com prova correta responde 409; todo o resto responde 401 uniforme.
   */
  async registrar(
    dados: CriarSolicitacaoSvoExternaInput,
    tentativa: TentativaCriacaoExterna,
    opcoes: { agora?: Date } = {},
  ): Promise<ResultadoCriacaoExterna> {
    const { chaveIdempotencia, provaTentativa } = tentativa;

    return db.transaction(async (trx) => {
      await solicitacaoSvoExternaModel.bloquearTentativa(trx, chaveIdempotencia);

      const existente = await acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia(
        chaveIdempotencia,
        trx,
      );
      if (existente) {
        const recuperada = await acompanhamentoExternoSvoService.recuperarComprovanteTentativa(
          { chaveIdempotencia, provaTentativa, payloadNormalizado: dados, agora: opcoes.agora },
          trx,
        );
        return {
          criada: false,
          protocolo: recuperada.protocolo,
          credencial: recuperada.credencial,
          registradaEm: recuperada.emitidaEm,
        };
      }

      let solicitacaoId: number | undefined;
      let protocolo = '';
      for (let tentativaProtocolo = 1; solicitacaoId === undefined; tentativaProtocolo += 1) {
        protocolo = gerarProtocoloExternoSvo(opcoes.agora);
        try {
          // Ponto de salvamento: colisão de protocolo (muito rara) não derruba a transação inteira
          solicitacaoId = await trx.transaction((ponto) =>
            solicitacaoSvoExternaModel.inserirSolicitacao(ponto, protocolo, dados.local_ocorrencia));
        } catch (erro) {
          const colisao = typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === VIOLACAO_UNIQUE_POSTGRES;
          if (!colisao || tentativaProtocolo >= TENTATIVAS_DE_PROTOCOLO) throw erro;
        }
      }

      await solicitacaoSvoExternaModel.inserirDadosProtegidos(trx, solicitacaoId, dados);
      // Credencial aleatória, digest com chave dedicada/versionada e envelope de recuperação: tudo na SCRUM-266
      const emitida = await acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx, {
        solicitacaoId,
        protocolo,
        chaveIdempotencia,
        payloadNormalizado: dados,
        provaTentativa,
        habilitarRecuperacao: true,
        agora: opcoes.agora,
      });

      // A trilha guarda só o identificador: nenhum dado pessoal
      await auditoriaModel.registrar(
        {
          usuario_id: null,
          acao: `CRIOU_SOLICITACAO_SVO_EXTERNA id=${solicitacaoId}`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_SVO,
        },
        trx,
      );
      // S1 na mesma transação/outbox, sem autor interno: todos os destinatários elegíveis são avisados
      await notificacaoSvoService.publicarAlertasRegistroSolicitacao({ id: solicitacaoId }, null, trx);

      return { criada: true, protocolo: emitida.protocolo, credencial: emitida.credencial, registradaEm: emitida.emitidaEm };
    });
  },
};
