import type { Knex } from 'knex';
import type { CriarSolicitacaoSvoExternaInput } from '../validators/solicitacaoSvoExternaSchemas';

// Rótulo operacional da fila; identidade e contato ficam só nas tabelas protegidas
export const ROTULO_SOLICITANTE_EXTERNO = 'Solicitação externa';

export interface CredencialExistente {
  solicitacao_id: number;
  protocolo: string | null;
  segredo_digest: string;
  algoritmo_digest: string;
  payload_criacao_digest: string;
  prova_tentativa_digest: string | null;
  emitida_em: Date | string;
  revogada_em: Date | string | null;
}

export interface NovaCredencialExterna {
  solicitacaoId: number;
  segredoDigest: string;
  algoritmoDigest: string;
  chaveIdempotencia: string;
  payloadDigest: string;
  provaDigest: string;
}

// Só as colunas que a role da aplicação pode gravar (database/scrum263-privilegios.cjs).
// Versão, datas e demais campos usam os padrões do banco.
export const solicitacaoSvoExternaModel = {
  // Serializa tentativas com a mesma chave, inclusive entre processos; solta no fim da transação
  async bloquearTentativa(trx: Knex.Transaction, chaveIdempotencia: string): Promise<void> {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [chaveIdempotencia]);
  },

  async buscarCredencialPorChave(trx: Knex.Transaction, chaveIdempotencia: string): Promise<CredencialExistente | undefined> {
    return trx('solicitacoes_svo_credenciais_externas as c')
      .join('solicitacoes_svo as s', 's.id', 'c.solicitacao_id')
      .where('c.chave_idempotencia_criacao', chaveIdempotencia)
      .first(
        'c.solicitacao_id', 's.protocolo', 'c.segredo_digest', 'c.algoritmo_digest',
        'c.payload_criacao_digest', 'c.prova_tentativa_digest', 'c.emitida_em', 'c.revogada_em',
      );
  },

  // Canal EXTERNA, registrante nulo e estado inicial são definidos aqui, nunca pela requisição
  async inserirSolicitacao(trx: Knex.Transaction, protocolo: string, localOcorrencia: string): Promise<number> {
    const [linha] = await trx('solicitacoes_svo')
      .insert({
        registrante_id: null,
        canal_origem: 'EXTERNA',
        protocolo,
        dados_solicitante: ROTULO_SOLICITANTE_EXTERNO,
        local_ocorrencia: localOcorrencia,
        material_sensivel: false,
        status: 'EM_TRIAGEM',
      })
      .returning<{ id: number }[]>('id');
    return linha!.id;
  },

  async inserirDadosProtegidos(trx: Knex.Transaction, solicitacaoId: number, d: CriarSolicitacaoSvoExternaInput): Promise<void> {
    await trx('solicitacoes_svo_dados_externos').insert({
      solicitacao_id: solicitacaoId,
      nome_solicitante: d.nome_solicitante,
      cpf_solicitante: d.cpf_solicitante,
      tipo_solicitante: d.tipo_solicitante,
      nome_instituicao: d.nome_instituicao ?? null,
      nome_falecido: d.nome_falecido,
      documento_falecido: d.documento_falecido ?? null,
      telefone_solicitante: d.telefone_solicitante,
      email_solicitante: d.email_solicitante,
      numero_imovel: d.numero_imovel ?? null,
      sem_numero_imovel: d.sem_numero_imovel,
      complemento_ocorrencia: d.complemento_ocorrencia ?? null,
      ponto_referencia: d.ponto_referencia ?? null,
      latitude_ocorrencia: d.latitude_ocorrencia ?? null,
      longitude_ocorrencia: d.longitude_ocorrencia ?? null,
      fora_area_cobertura: d.fora_area_cobertura,
      descricao_ocorrencia: d.descricao_ocorrencia,
      data_hora_ocorrencia: d.data_hora_ocorrencia,
      informacoes_medicas: d.informacoes_medicas ?? null,
      ciencia_aviso_privacidade: d.ciencia_aviso_privacidade,
      versao_aviso_privacidade: d.versao_aviso_privacidade,
    });
  },

  async inserirCredencial(trx: Knex.Transaction, c: NovaCredencialExterna): Promise<Date | string> {
    const [linha] = await trx('solicitacoes_svo_credenciais_externas')
      .insert({
        solicitacao_id: c.solicitacaoId,
        segredo_digest: c.segredoDigest,
        algoritmo_digest: c.algoritmoDigest,
        chave_idempotencia_criacao: c.chaveIdempotencia,
        payload_criacao_digest: c.payloadDigest,
        prova_tentativa_digest: c.provaDigest,
      })
      .returning<{ emitida_em: Date | string }[]>('emitida_em');
    return linha!.emitida_em;
  },
};
