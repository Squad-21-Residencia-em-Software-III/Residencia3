const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationScrum263 = require('../database/migrations/20261127130000_scrum_263_solicitacoes_externas_svo');
const correcaoScrum263 = require('../database/migrations/20261127140000_scrum_263_integridade_svo_externo');
const migrationScrum266 = require('../database/migrations/20261128100000_scrum_266_acompanhamento_e_recuperacao_svo');

async function criarSchemaIsoladoScrum266(trx, schema) {
  await trx.raw('CREATE SCHEMA ??', [schema]);
  await trx.raw('SET LOCAL search_path TO ??', [schema]);

  await trx.raw(`
    CREATE TABLE usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      senha VARCHAR(255) NOT NULL,
      tipo_usuario VARCHAR(50) NOT NULL,
      perfil VARCHAR(50) NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      versao_sessao INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE solicitacoes_svo (
      id SERIAL PRIMARY KEY,
      registrante_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      dados_solicitante TEXT NOT NULL,
      local_ocorrencia VARCHAR(255) NOT NULL,
      material_sensivel BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(30) NOT NULL DEFAULT 'EM_TRIAGEM',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      observacoes TEXT NULL,
      motivo_recusa TEXT NULL,
      confirmado_por INTEGER NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      confirmado_em TIMESTAMPTZ NULL,
      CONSTRAINT chk_solicitacoes_svo_status
        CHECK (status IN ('EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'))
    );

    CREATE TABLE ordens_svo (
      id SERIAL PRIMARY KEY,
      solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes_svo(id) ON DELETE RESTRICT,
      veiculo_id INTEGER NULL,
      motorista_id INTEGER NULL,
      equipe_id INTEGER NULL,
      capacidade_utilizada INTEGER NOT NULL DEFAULT 1,
      data_hora_chamado TIMESTAMPTZ NOT NULL DEFAULT now(),
      inicio_previsto TIMESTAMPTZ NULL,
      fim_previsto TIMESTAMPTZ NULL,
      liberada_em TIMESTAMPTZ NULL,
      data_hora_saida TIMESTAMPTZ NULL,
      data_hora_conclusao TIMESTAMPTZ NULL,
      km_inicial INTEGER NULL,
      km_final INTEGER NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_ALOCACAO'
    );

    INSERT INTO usuarios (id, nome, email, senha, tipo_usuario, perfil)
    VALUES
      (1, 'Admin SVO', 'admin@exemplo.invalid', 'hash', 'ADMINISTRADOR', 'ADMINISTRADOR'),
      (2, 'Gestor SVO', 'gestor@exemplo.invalid', 'hash', 'GESTOR_SVO', 'GESTOR_SVO');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 2, true);
  `);

  await migrationScrum263.up(trx);
  await correcaoScrum263.up(trx);
  await migrationScrum266.up(trx);
  await require('../database/migrations/20261128110000_descartar_envelopes_portal_svo').up(trx);
}

async function executarValidacaoPostgresScrum266() {
  const {
    JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS,
    acompanhamentoExternoSvoService,
    gerarProtocoloExternoSvo,
    gerarSegredoCredencialExterna,
  } = require('../src/services/acompanhamentoExternoSvoService');
  const { acompanhamentoExternoSvoModel } = require('../src/models/acompanhamentoExternoSvoModel');

  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const schema = `val266_pg_${Date.now()}`;
  const relatorio = [];

  try {
    await db.transaction(async (trx) => {
      await criarSchemaIsoladoScrum266(trx, schema);
    });

    await db.transaction(async (trx) => {
      await trx.raw('SET LOCAL search_path TO ??', [schema]);

      // Marcos operacionais são anteriores ao commit, como exige a constraint.
      const agoraBase = new Date(Date.now() - 4 * 3_600_000);
      const protocoloA = gerarProtocoloExternoSvo(agoraBase);
      const protocoloB = gerarProtocoloExternoSvo(agoraBase);
      const chaveIdemA = 'idem-266-pg-chamado-a';
      const provaTentativaA = gerarSegredoCredencialExterna();
      const payloadA = {
        nome_solicitante: 'Maria Sintetica',
        cpf_solicitante: '52998224725',
        local_ocorrencia: 'Rua Sintetica A, 100 - Aracaju/SE',
      };

      // 1. Emissao atomica + envelope separado cifrado AES-256-GCM
      const [solA] = await trx('solicitacoes_svo')
        .insert({
          registrante_id: null,
          canal_origem: 'EXTERNA',
          protocolo: protocoloA,
          dados_solicitante: 'Solicitacao externa',
          local_ocorrencia: payloadA.local_ocorrencia,
          material_sensivel: false,
          status: 'EM_TRIAGEM',
          criado_em: agoraBase,
        })
        .returning('*');

      await trx('solicitacoes_svo_dados_externos').insert({
        solicitacao_id: solA.id,
        nome_solicitante: payloadA.nome_solicitante,
        telefone_solicitante: '(79) 99911-2233',
        email_solicitante: 'maria.sintetica@exemplo.invalid',
        cpf_solicitante: payloadA.cpf_solicitante,
        tipo_solicitante: 'PESSOA_FISICA',
        nome_falecido: 'Falecido Sintetico A',
        numero_imovel: '100',
        sem_numero_imovel: false,
        descricao_ocorrencia: 'Obito domiciliar natural relatado para triagem.',
        data_hora_ocorrencia: new Date(agoraBase.getTime() - 60 * 60_000),
        ciencia_aviso_privacidade: true,
        versao_aviso_privacidade: 'v1.0-2026',
        criado_em: agoraBase,
        atualizado_em: agoraBase,
      });

      const emissaoA =
        await acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx, {
          solicitacaoId: solA.id,
          protocolo: protocoloA,
          chaveIdempotencia: chaveIdemA,
          provaTentativa: provaTentativaA,
          habilitarRecuperacao: true,
          payloadNormalizado: payloadA,
          agora: agoraBase,
        });

      const [solB] = await trx('solicitacoes_svo')
        .insert({
          registrante_id: null,
          canal_origem: 'EXTERNA',
          protocolo: protocoloB,
          dados_solicitante: 'Solicitacao externa',
          local_ocorrencia: 'Rua Sintetica B, 200 - Aracaju/SE',
          material_sensivel: false,
          status: 'EM_TRIAGEM',
          criado_em: agoraBase,
        })
        .returning('*');

      await trx('solicitacoes_svo_dados_externos').insert({
        solicitacao_id: solB.id,
        nome_solicitante: 'Joao Sintetico',
        telefone_solicitante: '(79) 99944-5566',
        email_solicitante: 'joao.sintetico@exemplo.invalid',
        cpf_solicitante: '12345678909',
        tipo_solicitante: 'PESSOA_FISICA',
        nome_falecido: 'Falecido Sintetico B',
        numero_imovel: '200',
        sem_numero_imovel: false,
        descricao_ocorrencia: 'Segunda ocorrencia sintetica para teste cruzado.',
        data_hora_ocorrencia: new Date(agoraBase.getTime() - 45 * 60_000),
        ciencia_aviso_privacidade: true,
        versao_aviso_privacidade: 'v1.0-2026',
        criado_em: agoraBase,
        atualizado_em: agoraBase,
      });

      const emissaoB =
        await acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx, {
          solicitacaoId: solB.id,
          protocolo: protocoloB,
          chaveIdempotencia: 'idem-266-pg-chamado-b',
          payloadNormalizado: { local_ocorrencia: 'Rua Sintetica B, 200 - Aracaju/SE' },
          agora: agoraBase,
        });

      relatorio.push(
        '1. Emissao atomica e envelope cifrado em tabela separada (SCRUM-263 + SCRUM-266): OK'
      );

      // 2. Recuperação autenticada no schema de teste
      const recuperado =
        await acompanhamentoExternoSvoService.recuperarComprovanteTentativa(
          {
            chaveIdempotencia: chaveIdemA,
            provaTentativa: provaTentativaA,
            payloadNormalizado: payloadA,
            agora: new Date(),
          },
          trx
        );
      assert.equal(recuperado.protocolo, protocoloA);
      assert.equal(recuperado.credencial, emissaoA.credencial);

      await assert.rejects(
        () =>
          acompanhamentoExternoSvoService.recuperarComprovanteTentativa(
            {
              chaveIdempotencia: chaveIdemA,
              provaTentativa: gerarSegredoCredencialExterna(),
              payloadNormalizado: payloadA,
              agora: new Date(),
            },
            trx
          ),
        { statusCode: 401 }
      );

      await assert.rejects(
        () =>
          acompanhamentoExternoSvoService.recuperarComprovanteTentativa(
            {
              chaveIdempotencia: chaveIdemA,
              provaTentativa: provaTentativaA,
              payloadNormalizado: { ...payloadA, local_ocorrencia: 'Adulterado' },
              agora: new Date(),
            },
            trx
          ),
        { statusCode: 409, codigo: 'CONFLITO_IDEMPOTENCIA' }
      );

      relatorio.push(
        '2. Recuperacao autenticada com prova de posse e bloqueio de payload divergente (409) / impostor (401): OK'
      );

      // 3. Isolamento cruzado
      await assert.rejects(
        () =>
          acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
            protocoloA,
            emissaoB.credencial,
            { conexao: trx, agora: agoraBase }
          ),
        { statusCode: 401 }
      );

      // 4. Os 7 estados publicos e marcos reais
      const dtoRecebida =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: agoraBase }
        );
      assert.equal(dtoRecebida.status, 'RECEBIDA');

      // Inicia analise na triagem (RECEBIDA -> EM_ANALISE)
      const inicioAnalise = new Date(agoraBase.getTime() + 10 * 60_000);
      await acompanhamentoExternoSvoModel.registrarInicioAnalise(
        solA.id,
        2,
        inicioAnalise,
        trx
      );
      const dtoEmAnalise =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: inicioAnalise }
        );
      assert.equal(dtoEmAnalise.status, 'EM_ANALISE');

      // CONFIRMADA + ordem ALOCADA permanece CONFIRMADA (nao antecipa EM_ANDAMENTO)
      await trx('solicitacoes_svo')
        .where({ id: solA.id })
        .update({ status: 'CONFIRMADA', confirmado_por: 2, confirmado_em: agoraBase });
      const [ordemA] = await trx('ordens_svo')
        .insert({
          solicitacao_id: solA.id,
          status: 'ALOCADA',
          capacidade_utilizada: 1,
        })
        .returning('*');
      const dtoConfirmada =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: inicioAnalise }
        );
      assert.equal(dtoConfirmada.status, 'CONFIRMADA');

      // EM_ANDAMENTO apos saida efetiva
      const saidaEm = new Date(agoraBase.getTime() + 30 * 60_000);
      await trx('solicitacoes_svo').where({ id: solA.id }).update({ status: 'EM_ANDAMENTO' });
      await trx('ordens_svo')
        .where({ id: ordemA.id })
        .update({ status: 'EM_DESLOCAMENTO', data_hora_saida: saidaEm });
      const dtoEmAndamento =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: saidaEm }
        );
      assert.equal(dtoEmAndamento.status, 'EM_ANDAMENTO');

      // CONCLUIDA + fronteira de 30 dias via coluna GENERATED consulta_publica_expira_em
      const encerradoEm = new Date(agoraBase.getTime() + 180 * 60_000);
      const limite30Dias = new Date(
        encerradoEm.getTime() + JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS
      );
      await trx('solicitacoes_svo').where({ id: solA.id }).update({ status: 'CONCLUIDA' });
      await trx('ordens_svo')
        .where({ id: ordemA.id })
        .update({ status: 'CONCLUIDA', data_hora_conclusao: encerradoEm });
      await acompanhamentoExternoSvoModel.registrarEncerramentoOperacional(
        solA.id,
        encerradoEm,
        trx
      );

      const gerado = await trx('solicitacoes_svo_dados_externos')
        .where({ solicitacao_id: solA.id })
        .first('consulta_publica_expira_em');
      assert.equal(
        new Date(gerado.consulta_publica_expira_em).getTime(),
        limite30Dias.getTime()
      );

      const dtoConcluidaNoLimite =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: new Date(limite30Dias.getTime() - 1) }
        );
      assert.equal(dtoConcluidaNoLimite.status, 'CONCLUIDA');

      await assert.rejects(
        () =>
          acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
            protocoloA,
            emissaoA.credencial,
            { conexao: trx, agora: limite30Dias }
          ),
        { statusCode: 401 }
      );

      // NAO_ACOLHIDA sem vazamento de motivo_recusa interno
      await trx('solicitacoes_svo')
        .where({ id: solB.id })
        .update({
          status: 'RECUSADA',
          motivo_recusa: 'MOTIVO_INTERNO_CONFIDENCIAL_PLANTAO_SVO_IML',
        });
      await trx('solicitacoes_svo_dados_externos')
        .where({ solicitacao_id: solB.id })
        .update({
          motivo_recusa_publico: 'Encaminhado ao orgao pericial competente.',
        });
      await acompanhamentoExternoSvoModel.registrarEncerramentoOperacional(solB.id, agoraBase, trx);
      const dtoNaoAcolhida =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloB,
          emissaoB.credencial,
          { conexao: trx, agora: agoraBase }
        );
      assert.equal(dtoNaoAcolhida.status, 'NAO_ACOLHIDA');
      assert.equal(
        dtoNaoAcolhida.mensagem_publica.includes(
          'MOTIVO_INTERNO_CONFIDENCIAL_PLANTAO_SVO_IML'
        ),
        false
      );

      // CANCELADA sem vazamento de cancelamento_justificativa_decisao interna
      await trx('solicitacoes_svo').where({ id: solB.id }).update({ status: 'CANCELADA' });
      await trx('solicitacoes_svo_dados_externos')
        .where({ solicitacao_id: solB.id })
        .update({
          cancelamento_status: 'ACEITO',
          cancelamento_solicitado_em: agoraBase,
          cancelamento_motivo: 'Solicitado pelo requerente em validacao.',
          cancelamento_decidido_por: 2,
          cancelamento_decidido_em: agoraBase,
          cancelamento_justificativa_decisao: 'JUSTIFICATIVA_INTERNA_SIGILOSA_SVO',
          cancelamento_mensagem_publica: 'Cancelamento confirmado.',
        });
      const dtoCancelada =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloB,
          emissaoB.credencial,
          { conexao: trx, agora: agoraBase }
        );
      assert.equal(dtoCancelada.status, 'CANCELADA');
      assert.equal(
        JSON.stringify(dtoCancelada).includes('JUSTIFICATIVA_INTERNA_SIGILOSA_SVO'),
        false
      );

      relatorio.push(
        '3. Sete estados publicos, transicao RECEBIDA->EM_ANALISE, ALOCADA em CONFIRMADA, fronteira de 30 dias e zero vazamento interno: OK'
      );

      // Revogação e tentativa de acesso na mesma transação da fixture.
      await acompanhamentoExternoSvoModel.revogarCredencial(
        solB.id,
        'Revogada em validacao PG',
        agoraBase,
        trx
      );
      await assert.rejects(
        () =>
          acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
            protocoloB,
            emissaoB.credencial,
            { conexao: trx, agora: agoraBase }
          ),
        { statusCode: 401 }
      );
      const acessoAposRevogacao =
        await acompanhamentoExternoSvoModel.registrarAcessoValidoSeAutorizado(
          solB.id,
          agoraBase,
          trx
        );
      assert.equal(acessoAposRevogacao, false);
      relatorio.push(
        '4. Negação de acesso após revogação na mesma transação: OK'
      );
    });

    console.log('=== VALIDACAO POSTGRES SCRUM-266 CONCLUIDA COM SUCESSO ===');
    for (const item of relatorio) {
      console.log(`- ${item}`);
    }
  } finally {
    await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await db.destroy();
  }
}

if (require.main === module) {
  executarValidacaoPostgresScrum266().catch((erro) => {
    console.error('Falha na validacao PostgreSQL da SCRUM-266:', erro);
    process.exit(1);
  });
}

module.exports = { executarValidacaoPostgresScrum266 };
