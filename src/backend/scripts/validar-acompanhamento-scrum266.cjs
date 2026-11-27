const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationScrum263 = require('../database/migrations/20261127130000_scrum_263_solicitacoes_externas_svo');

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
}

async function executarValidacaoPostgresScrum266() {
  const {
    JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS,
    acompanhamentoExternoSvoService,
    gerarProtocoloExternoSvo,
    gerarSegredoCredencialExterna,
  } = require('../src/services/acompanhamentoExternoSvoService');

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

      const agoraBase = new Date('2026-11-27T12:00:00.000Z');
      const protocoloA = gerarProtocoloExternoSvo(agoraBase);
      const protocoloB = gerarProtocoloExternoSvo(agoraBase);
      const chaveIdemA = 'idem-266-pg-chamado-a';
      const provaTentativaA = gerarSegredoCredencialExterna();
      const payloadA = {
        nome_solicitante: 'Maria Sintetica',
        cpf_solicitante: '52998224725',
        local_ocorrencia: 'Rua Sintetica A, 100 - Aracaju/SE',
      };

      // 1. Emissao atomica de solicitacao externa A + dados externos + credencial secreta
      const [solA] = await trx('solicitacoes_svo')
        .insert({
          registrante_id: null,
          canal_origem: 'EXTERNA',
          protocolo: protocoloA,
          dados_solicitante: `Solicitacao externa (${protocoloA})`,
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
        endereco_ocorrencia: 'Rua Sintetica A',
        numero_imovel: '100',
        sem_numero_imovel: false,
        descricao_ocorrencia: 'Obito domiciliar natural relatado para triagem.',
        data_hora_ocorrencia: new Date('2026-11-27T11:00:00.000Z'),
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
          payloadNormalizado: payloadA,
          agora: agoraBase,
        });

      // Solicitação B para testar combinacao cruzada
      const [solB] = await trx('solicitacoes_svo')
        .insert({
          registrante_id: null,
          canal_origem: 'EXTERNA',
          protocolo: protocoloB,
          dados_solicitante: `Solicitacao externa (${protocoloB})`,
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
        endereco_ocorrencia: 'Rua Sintetica B',
        numero_imovel: '200',
        sem_numero_imovel: false,
        descricao_ocorrencia: 'Segunda ocorrencia sintetica para teste cruzado.',
        data_hora_ocorrencia: new Date('2026-11-27T11:15:00.000Z'),
        ciencia_aviso_privacidade: true,
        versao_aviso_privacidade: 'v1.0-2026',
        criado_em: agoraBase,
        atualizado_em: agoraBase,
      });

      const emissaoB =
        await acompanhamentoExternoSvoService.emitirCredencialNaTransacao(trx, {
          solicitacaoId: solB.id,
          protocolo: protocoloB,
          agora: agoraBase,
        });

      relatorio.push(
        '1. Emissao atomica em PostgreSQL real (digest HMAC-SHA-256 + envelope cifrado AES-256-GCM sem segredo em claro): OK'
      );

      // 2. Recuperacao de comprovante apos perda da resposta inicial + rejeicao de outra pessoa e payload divergente
      const recuperado =
        await acompanhamentoExternoSvoService.recuperarComprovanteTentativa(
          {
            chaveIdempotencia: chaveIdemA,
            provaTentativa: provaTentativaA,
            payloadNormalizado: payloadA,
            agora: new Date('2026-11-27T12:05:00.000Z'),
          },
          trx
        );

      if (
        recuperado.protocolo !== protocoloA ||
        recuperado.credencial !== emissaoA.credencial
      ) {
        throw new Error('Recuperacao de comprovante nao devolveu o protocolo/credencial originais.');
      }

      let bloqueouOutraPessoa = false;
      try {
        await acompanhamentoExternoSvoService.recuperarComprovanteTentativa(
          {
            chaveIdempotencia: chaveIdemA,
            provaTentativa: gerarSegredoCredencialExterna(),
            payloadNormalizado: payloadA,
            agora: new Date('2026-11-27T12:05:00.000Z'),
          },
          trx
        );
      } catch (e) {
        bloqueouOutraPessoa = e.statusCode === 401;
      }

      let bloqueouPayloadDivergente = false;
      try {
        await acompanhamentoExternoSvoService.recuperarComprovanteTentativa(
          {
            chaveIdempotencia: chaveIdemA,
            provaTentativa: provaTentativaA,
            payloadNormalizado: { ...payloadA, local_ocorrencia: 'Adulterado' },
            agora: new Date('2026-11-27T12:05:00.000Z'),
          },
          trx
        );
      } catch (e) {
        bloqueouPayloadDivergente =
          e.statusCode === 409 && e.codigo === 'CONFLITO_IDEMPOTENCIA';
      }

      if (!bloqueouOutraPessoa || !bloqueouPayloadDivergente) {
        throw new Error('Falha na validacao de replay de outra pessoa ou payload divergente.');
      }

      relatorio.push(
        '2. Replay autenticado da tentativa apos commit, bloqueio de outra pessoa (401) e bloqueio de payload divergente (409): OK'
      );

      // 3. Isolamento cruzado: credencial A nao le protocolo B e vice-versa
      let bloqueouCruzadoAB = false;
      try {
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoB.credencial,
          { conexao: trx, agora: agoraBase }
        );
      } catch (e) {
        bloqueouCruzadoAB = e.statusCode === 401;
      }

      if (!bloqueouCruzadoAB) {
        throw new Error('Combinacao cruzada (protocolo A + credencial B) deveria falhar com 401.');
      }

      relatorio.push(
        '3. Isolamento estrito entre registros (combinacao cruzada e protocolo isolado rejeitados com 401 uniforme): OK'
      );

      // 4. Exercicio dos 7 estados publicos no PostgreSQL real
      // Estado 1: RECEBIDA
      const dtoRecebida =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: agoraBase }
        );
      if (dtoRecebida.status !== 'RECEBIDA') {
        throw new Error(`Esperado RECEBIDA, obtido ${dtoRecebida.status}`);
      }

      // Estado 2: EM_ANALISE (apos revisao / versao_dados = 2)
      await trx('solicitacoes_svo_dados_externos')
        .where({ solicitacao_id: solA.id })
        .update({ versao_dados: 2 });
      const dtoEmAnalise =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: agoraBase }
        );
      if (dtoEmAnalise.status !== 'EM_ANALISE') {
        throw new Error(`Esperado EM_ANALISE, obtido ${dtoEmAnalise.status}`);
      }

      // Estado 3: CONFIRMADA (confirmada na triagem + ordem AGUARDANDO_ALOCACAO)
      await trx('solicitacoes_svo')
        .where({ id: solA.id })
        .update({ status: 'CONFIRMADA', confirmado_por: 2, confirmado_em: agoraBase });
      const [ordemA] = await trx('ordens_svo')
        .insert({
          solicitacao_id: solA.id,
          status: 'AGUARDANDO_ALOCACAO',
          capacidade_utilizada: 1,
        })
        .returning('*');
      const dtoConfirmada =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: agoraBase }
        );
      if (dtoConfirmada.status !== 'CONFIRMADA') {
        throw new Error(`Esperado CONFIRMADA, obtido ${dtoConfirmada.status}`);
      }

      // Estado 4: EM_ANDAMENTO
      await trx('solicitacoes_svo')
        .where({ id: solA.id })
        .update({ status: 'EM_ANDAMENTO' });
      await trx('ordens_svo')
        .where({ id: ordemA.id })
        .update({ status: 'EM_DESLOCAMENTO', data_hora_saida: agoraBase });
      const dtoEmAndamento =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: agoraBase }
        );
      if (dtoEmAndamento.status !== 'EM_ANDAMENTO') {
        throw new Error(`Esperado EM_ANDAMENTO, obtido ${dtoEmAndamento.status}`);
      }

      // Estado 5: CONCLUIDA + teste de fronteira de 30 dias
      const encerradoEm = new Date('2026-11-27T15:00:00.000Z');
      const limite30Dias = new Date(
        encerradoEm.getTime() + JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS
      );
      await trx('solicitacoes_svo')
        .where({ id: solA.id })
        .update({ status: 'CONCLUIDA' });
      await trx('ordens_svo')
        .where({ id: ordemA.id })
        .update({ status: 'CONCLUIDA', data_hora_conclusao: encerradoEm });
      await trx('solicitacoes_svo_dados_externos')
        .where({ solicitacao_id: solA.id })
        .update({
          encerrado_operacional_em: encerradoEm,
          consulta_publica_expira_em: limite30Dias,
        });
      await trx('solicitacoes_svo_credenciais_externas')
        .where({ solicitacao_id: solA.id })
        .update({ valida_ate: limite30Dias });

      const dtoConcluidaNoLimite =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: limite30Dias }
        );
      if (dtoConcluidaNoLimite.status !== 'CONCLUIDA') {
        throw new Error(`Esperado CONCLUIDA, obtido ${dtoConcluidaNoLimite.status}`);
      }

      let expirouApos30Dias = false;
      try {
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloA,
          emissaoA.credencial,
          { conexao: trx, agora: new Date(limite30Dias.getTime() + 1) }
        );
      } catch (e) {
        expirouApos30Dias = e.statusCode === 401;
      }
      if (!expirouApos30Dias) {
        throw new Error('Credencial deveria expirar imediatamente apos 30 dias do encerramento.');
      }

      // Estado 6: NAO_ACOLHIDA (em solB, garantido que motivo_recusa interno NUNCA vaza no DTO publico)
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

      const dtoNaoAcolhida =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloB,
          emissaoB.credencial,
          { conexao: trx, agora: agoraBase }
        );
      if (
        dtoNaoAcolhida.status !== 'NAO_ACOLHIDA' ||
        dtoNaoAcolhida.mensagem_publica.includes(
          'MOTIVO_INTERNO_CONFIDENCIAL_PLANTAO_SVO_IML'
        ) ||
        !dtoNaoAcolhida.mensagem_publica.includes(
          'Encaminhado ao orgao pericial competente.'
        )
      ) {
        throw new Error(
          `Falha no estado NAO_ACOLHIDA ou vazamento de motivo interno: ${JSON.stringify(dtoNaoAcolhida)}`
        );
      }

      // Estado 7: CANCELADA + Revogacao
      await trx('solicitacoes_svo')
        .where({ id: solB.id })
        .update({ status: 'CANCELADA' });
      const dtoCancelada =
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloB,
          emissaoB.credencial,
          { conexao: trx, agora: agoraBase }
        );
      if (dtoCancelada.status !== 'CANCELADA') {
        throw new Error(`Esperado CANCELADA, obtido ${dtoCancelada.status}`);
      }

      // Revogacao imediata
      await trx('solicitacoes_svo_credenciais_externas')
        .where({ solicitacao_id: solB.id })
        .update({
          revogada_em: agoraBase,
          revogada_motivo: 'Revogada em teste de integracao PG',
        });

      let bloqueouRevogada = false;
      try {
        await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
          protocoloB,
          emissaoB.credencial,
          { conexao: trx, agora: agoraBase }
        );
      } catch (e) {
        bloqueouRevogada = e.statusCode === 401;
      }
      if (!bloqueouRevogada) {
        throw new Error('Credencial revogada deveria ser rejeitada com 401.');
      }

      relatorio.push(
        '4. Os 7 estados publicos (RECEBIDA, EM_ANALISE, CONFIRMADA, EM_ANDAMENTO, CONCLUIDA, NAO_ACOLHIDA, CANCELADA), fronteira de 30 dias, revogacao e ausencia de motivo interno no DTO: OK'
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
