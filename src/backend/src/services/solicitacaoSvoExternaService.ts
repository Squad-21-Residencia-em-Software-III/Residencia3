import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { solicitacaoSvoExternaModel } from '../models/solicitacaoSvoExternaModel';
import type { CriarSolicitacaoSvoExternaInput } from '../validators/solicitacaoSvoExternaSchemas';
import {
  ALGORITMO_DIGEST_CREDENCIAL,
  calcularDigestCredencialExterna,
  calcularDigestPayloadCriacao,
  calcularDigestProvaTentativa,
  derivarCredencialExterna,
  digestsIguais,
  gerarProtocoloExternoSvo,
} from './credencialExternaSvo';
import { notificacaoSvoService } from './notificacaoSvoService';

export interface TentativaCriacaoExterna {
  chaveIdempotencia: string;
  provaTentativa: string;
}

export interface ResultadoCriacaoExterna {
  /** true: chamado criado agora; false: repetição da mesma tentativa (replay) */
  criada: boolean;
  protocolo: string;
  credencial: string;
  registradaEm: string;
}

const VIOLACAO_UNIQUE_POSTGRES = '23505';
const TENTATIVAS_DE_PROTOCOLO = 3;

// Mesma resposta para payload diferente e prova errada: não revela qual dos dois falhou
const conflito = () =>
  new AppError('Esta tentativa de envio já foi usada com outro conteúdo. Gere um novo envio.', 409, 'IDEMPOTENCIA_CONFLITO');

const paraIso = (valor: Date | string): string => new Date(valor).toISOString();

export const solicitacaoSvoExternaService = {
  /**
   * Registra a solicitação do cidadão e só devolve o protocolo depois do commit.
   * Na mesma transação: chamado (canal EXTERNA, sem registrante), dados protegidos, credencial,
   * auditoria sem dado pessoal e o aviso S1 (sem S2, sem confirmação automática).
   * Repetir a mesma tentativa (mesma chave, mesmo conteúdo, mesma prova) devolve o mesmo resultado.
   */
  async registrar(
    dados: CriarSolicitacaoSvoExternaInput,
    tentativa: TentativaCriacaoExterna,
    opcoes: { agora?: Date } = {},
  ): Promise<ResultadoCriacaoExterna> {
    const { chaveIdempotencia, provaTentativa } = tentativa;
    const payloadDigest = calcularDigestPayloadCriacao(dados);
    const provaDigest = calcularDigestProvaTentativa(chaveIdempotencia, provaTentativa);
    const credencial = derivarCredencialExterna(chaveIdempotencia, provaTentativa);
    const segredoDigest = calcularDigestCredencialExterna(credencial);

    return db.transaction(async (trx) => {
      await solicitacaoSvoExternaModel.bloquearTentativa(trx, chaveIdempotencia);

      const existente = await solicitacaoSvoExternaModel.buscarCredencialPorChave(trx, chaveIdempotencia);
      if (existente) {
        if (
          !digestsIguais(existente.payload_criacao_digest, payloadDigest) ||
          !digestsIguais(existente.prova_tentativa_digest, provaDigest) ||
          !digestsIguais(existente.segredo_digest, segredoDigest) ||
          !existente.protocolo
        ) {
          throw conflito();
        }
        if (existente.revogada_em) {
          throw new AppError('Este acompanhamento não está mais disponível.', 410, 'CREDENCIAL_INDISPONIVEL');
        }
        return {
          criada: false,
          protocolo: existente.protocolo,
          credencial,
          registradaEm: paraIso(existente.emitida_em),
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
      const emitidaEm = await solicitacaoSvoExternaModel.inserirCredencial(trx, {
        solicitacaoId,
        segredoDigest,
        algoritmoDigest: ALGORITMO_DIGEST_CREDENCIAL,
        chaveIdempotencia,
        payloadDigest,
        provaDigest,
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

      return { criada: true, protocolo, credencial, registradaEm: paraIso(emitidaEm) };
    });
  },
};
