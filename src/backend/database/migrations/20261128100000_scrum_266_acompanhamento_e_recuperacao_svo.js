const {
  aplicarPrivilegiosSolicitacoesExternasSvo,
  DADOS,
  CREDENCIAIS,
  RECUPERACOES,
} = require('../privilegiosSolicitacoesExternasSvo.cjs');

const SOLICITACOES = 'solicitacoes_svo';

async function bloquearEscritas(knex) {
  await knex.raw('LOCK TABLE ??, ??, ?? IN ACCESS EXCLUSIVE MODE', [
    SOLICITACOES,
    DADOS,
    CREDENCIAIS,
  ]);
}

exports.up = async (knex) => {
  const {
    rows: [contexto],
  } = await knex.raw('SELECT current_schema() AS schema');
  const appUser = process.env.POSTGRES_APP_USER;
  const bancoDescartavel =
    (process.env.SOLICITACOES_EXTERNAS_SVO_DB_DESCARTAVEL === '1' ||
      process.env.SCRUM263_DB_DESCARTAVEL === '1') &&
    ['127.0.0.1', 'localhost', '::1'].includes(process.env.POSTGRES_HOST);

  if (
    (!appUser && !bancoDescartavel) ||
    (appUser && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser))
  ) {
    throw new Error(
      'SCRUM-266: configure POSTGRES_APP_USER para uma role de aplicação separada.'
    );
  }

  await bloquearEscritas(knex);

  await knex.raw(`
    ALTER TABLE solicitacoes_svo_dados_externos
      DROP CONSTRAINT chk_svo_externa_cancelamento_consistente,
      DROP CONSTRAINT chk_svo_externa_ciclo_pessoal,
      ADD COLUMN analise_iniciada_em timestamptz NULL,
      ADD COLUMN analise_iniciada_por integer NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      ADD COLUMN cancelamento_mensagem_publica varchar(500) NULL,
      ADD CONSTRAINT chk_svo_externa_analise_consistente CHECK (
        (analise_iniciada_em IS NULL AND analise_iniciada_por IS NULL)
        OR (analise_iniciada_em IS NOT NULL AND analise_iniciada_por IS NOT NULL
          AND analise_iniciada_em >= criado_em)
      ),
      ADD CONSTRAINT chk_svo_externa_cancelamento_consistente CHECK (
        (cancelamento_status IS NOT NULL
          AND (cancelamento_mensagem_publica IS NULL OR cancelamento_status IN ('ACEITO', 'NEGADO')))
        OR (
          cancelamento_solicitado_em IS NULL AND cancelamento_motivo IS NULL
          AND cancelamento_decidido_por IS NULL AND cancelamento_decidido_em IS NULL
          AND cancelamento_justificativa_decisao IS NULL
          AND cancelamento_mensagem_publica IS NULL
        )
      ),
      ADD CONSTRAINT chk_svo_externa_ciclo_pessoal CHECK (
        (anonimizado_em IS NULL AND expurgado_em IS NULL
          AND nome_solicitante IS NOT NULL AND length(btrim(nome_solicitante)) >= 2
          AND telefone_solicitante IS NOT NULL AND telefone_solicitante ~ '^[0-9+() -]{8,30}$'
          AND length(btrim(telefone_solicitante)) >= 8 AND telefone_solicitante = btrim(telefone_solicitante)
          AND email_solicitante IS NOT NULL AND length(email_solicitante) >= 5
          AND email_solicitante !~ '[[:space:][:cntrl:]]' AND position('@' in email_solicitante) > 1
          AND cpf_solicitante IS NOT NULL AND cpf_solicitante ~ '^[0-9]{11}$'
          AND cpf_solicitante !~ '^([0-9])\\1{10}$'
          AND nome_falecido IS NOT NULL AND length(btrim(nome_falecido)) >= 2
          AND descricao_ocorrencia IS NOT NULL AND length(btrim(descricao_ocorrencia)) >= 5
          AND data_hora_ocorrencia IS NOT NULL)
        OR
        ((anonimizado_em IS NOT NULL OR expurgado_em IS NOT NULL)
          AND nome_solicitante IS NULL AND telefone_solicitante IS NULL AND email_solicitante IS NULL
          AND cpf_solicitante IS NULL AND nome_instituicao IS NULL AND nome_falecido IS NULL
          AND documento_falecido IS NULL AND numero_imovel IS NULL AND complemento_ocorrencia IS NULL
          AND ponto_referencia IS NULL AND latitude_ocorrencia IS NULL AND longitude_ocorrencia IS NULL
          AND descricao_ocorrencia IS NULL AND informacoes_medicas IS NULL AND data_hora_ocorrencia IS NULL
          AND motivo_recusa_publico IS NULL AND analise_iniciada_em IS NULL AND analise_iniciada_por IS NULL
          AND cancelamento_status IS NULL AND cancelamento_solicitado_em IS NULL
          AND cancelamento_motivo IS NULL AND cancelamento_decidido_em IS NULL AND cancelamento_decidido_por IS NULL
          AND cancelamento_justificativa_decisao IS NULL AND cancelamento_mensagem_publica IS NULL)
      );

    CREATE TABLE solicitacoes_svo_recuperacoes_tentativa (
      solicitacao_id integer PRIMARY KEY
        REFERENCES solicitacoes_svo_credenciais_externas(solicitacao_id) ON DELETE RESTRICT,
      envelope_cifrado text NOT NULL
        CHECK (length(btrim(envelope_cifrado)) >= 16),
      versao_chave integer NOT NULL DEFAULT 1
        CHECK (versao_chave >= 1),
      criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expira_em timestamptz NOT NULL,
      descartada_em timestamptz NULL,
      CONSTRAINT chk_svo_recuperacao_janela CHECK (
        expira_em > criado_em AND expira_em <= criado_em + interval '15 minutes'
      ),
      CONSTRAINT chk_svo_recuperacao_descarte CHECK (
        descartada_em IS NULL OR descartada_em >= criado_em
      )
    );

    CREATE INDEX idx_svo_recuperacoes_expira_em
      ON solicitacoes_svo_recuperacoes_tentativa (expira_em)
      WHERE descartada_em IS NULL;

    CREATE FUNCTION validar_recuperacao_tentativa_svo()
    RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT FROM solicitacoes_svo_credenciais_externas c
         WHERE c.solicitacao_id = NEW.solicitacao_id
           AND c.prova_tentativa_digest IS NOT NULL
           AND c.revogada_em IS NULL
      ) THEN
        RAISE EXCEPTION 'SCRUM-266: recuperação autenticada exige prova de posse e credencial ativa.' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;

    CREATE TRIGGER trg_svo_recuperacao_exige_prova_tentativa
      BEFORE INSERT ON solicitacoes_svo_recuperacoes_tentativa
      FOR EACH ROW EXECUTE FUNCTION validar_recuperacao_tentativa_svo();

    REVOKE ALL ON FUNCTION validar_recuperacao_tentativa_svo() FROM PUBLIC;
  `);

  await aplicarPrivilegiosSolicitacoesExternasSvo(knex, contexto.schema, appUser);
};

exports.down = async (knex) => {
  const {
    rows: [contexto],
  } = await knex.raw('SELECT current_schema() AS schema');
  const appUser = process.env.POSTGRES_APP_USER;

  await bloquearEscritas(knex);

  if (
    (await knex(RECUPERACOES).first('solicitacao_id')) ||
    (await knex(DADOS)
      .whereNotNull('analise_iniciada_em')
      .orWhereNotNull('cancelamento_mensagem_publica')
      .first('solicitacao_id'))
  ) {
    throw new Error(
      'Rollback bloqueado: existem dados de acompanhamento ou recuperação SCRUM-266. Utilize roll-forward.'
    );
  }

  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_svo_recuperacao_exige_prova_tentativa ON solicitacoes_svo_recuperacoes_tentativa;
    DROP FUNCTION IF EXISTS validar_recuperacao_tentativa_svo();
    DROP TABLE IF EXISTS solicitacoes_svo_recuperacoes_tentativa;

    ALTER TABLE solicitacoes_svo_dados_externos
      DROP CONSTRAINT chk_svo_externa_analise_consistente,
      DROP CONSTRAINT chk_svo_externa_cancelamento_consistente,
      DROP CONSTRAINT chk_svo_externa_ciclo_pessoal,
      DROP COLUMN cancelamento_mensagem_publica,
      DROP COLUMN analise_iniciada_por,
      DROP COLUMN analise_iniciada_em,
      ADD CONSTRAINT chk_svo_externa_cancelamento_consistente CHECK (
        cancelamento_status IS NOT NULL OR (
          cancelamento_solicitado_em IS NULL AND cancelamento_motivo IS NULL
          AND cancelamento_decidido_por IS NULL AND cancelamento_decidido_em IS NULL
          AND cancelamento_justificativa_decisao IS NULL
        )
      ),
      ADD CONSTRAINT chk_svo_externa_ciclo_pessoal CHECK (
        (anonimizado_em IS NULL AND expurgado_em IS NULL
          AND nome_solicitante IS NOT NULL AND length(btrim(nome_solicitante)) >= 2
          AND telefone_solicitante IS NOT NULL AND telefone_solicitante ~ '^[0-9+() -]{8,30}$'
          AND length(btrim(telefone_solicitante)) >= 8 AND telefone_solicitante = btrim(telefone_solicitante)
          AND email_solicitante IS NOT NULL AND length(email_solicitante) >= 5
          AND email_solicitante !~ '[[:space:][:cntrl:]]' AND position('@' in email_solicitante) > 1
          AND cpf_solicitante IS NOT NULL AND cpf_solicitante ~ '^[0-9]{11}$'
          AND cpf_solicitante !~ '^([0-9])\\1{10}$'
          AND nome_falecido IS NOT NULL AND length(btrim(nome_falecido)) >= 2
          AND descricao_ocorrencia IS NOT NULL AND length(btrim(descricao_ocorrencia)) >= 5
          AND data_hora_ocorrencia IS NOT NULL)
        OR
        ((anonimizado_em IS NOT NULL OR expurgado_em IS NOT NULL)
          AND nome_solicitante IS NULL AND telefone_solicitante IS NULL AND email_solicitante IS NULL
          AND cpf_solicitante IS NULL AND nome_instituicao IS NULL AND nome_falecido IS NULL
          AND documento_falecido IS NULL AND numero_imovel IS NULL AND complemento_ocorrencia IS NULL
          AND ponto_referencia IS NULL AND latitude_ocorrencia IS NULL AND longitude_ocorrencia IS NULL
          AND descricao_ocorrencia IS NULL AND informacoes_medicas IS NULL AND data_hora_ocorrencia IS NULL
          AND motivo_recusa_publico IS NULL AND cancelamento_status IS NULL AND cancelamento_solicitado_em IS NULL
          AND cancelamento_motivo IS NULL AND cancelamento_decidido_em IS NULL AND cancelamento_decidido_por IS NULL
          AND cancelamento_justificativa_decisao IS NULL)
      );
  `);

  await aplicarPrivilegiosSolicitacoesExternasSvo(knex, contexto.schema, appUser);
};
