import type { Knex } from 'knex';
import type { CriarSolicitacaoSvoExternaInput } from '../validators/solicitacaoSvoExternaSchemas';

// Rótulo operacional da fila; identidade e contato ficam só nas tabelas protegidas
export const ROTULO_SOLICITANTE_EXTERNO = 'Solicitação externa';

// Só as colunas que a role da aplicação pode gravar (database/privilegiosSolicitacoesExternasSvo.cjs).
// A credencial e a recuperação da tentativa são do modelo da SCRUM-266 (acompanhamentoExternoSvoModel).
export const solicitacaoSvoExternaModel = {
  // Serializa tentativas com a mesma chave, inclusive entre processos; solta no fim da transação
  async bloquearTentativa(trx: Knex.Transaction, chaveIdempotencia: string): Promise<void> {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [chaveIdempotencia]);
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
};
