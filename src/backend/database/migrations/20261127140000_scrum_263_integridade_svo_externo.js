const anterior = require('./20261127130000_scrum_263_solicitacoes_externas_svo');
const { aplicarPrivilegiosScrum263, DADOS, CREDENCIAIS } = require('../scrum263-privilegios.cjs');

const SOLICITACOES = 'solicitacoes_svo';

async function validarCatalogoScrum263(knex, schema) {
  await anterior.validarCatalogoScrum263(knex);
  const { rows: [resultado] } = await knex.raw(`
    WITH esperadas(tabela, tipo, coluna, alvo) AS (
      VALUES ('solicitacoes_svo', 'f', 'registrante_id', 'usuarios'),
             ('solicitacoes_svo', 'u', 'protocolo', NULL),
             ('solicitacoes_svo_dados_externos', 'p', 'solicitacao_id', NULL),
             ('solicitacoes_svo_dados_externos', 'f', 'solicitacao_id', 'solicitacoes_svo'),
             ('solicitacoes_svo_dados_externos', 'f', 'cancelamento_decidido_por', 'usuarios'),
             ('solicitacoes_svo_dados_externos', 'f', 'expurgado_por', 'usuarios'),
             ('solicitacoes_svo_credenciais_externas', 'p', 'solicitacao_id', NULL),
             ('solicitacoes_svo_credenciais_externas', 'f', 'solicitacao_id', 'solicitacoes_svo'),
             ('solicitacoes_svo_credenciais_externas', 'u', 'chave_idempotencia_criacao', NULL)
    ), tabelas AS (
      SELECT t.oid, t.relname, t.relnamespace
        FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = ? AND t.relkind = 'r'
    )
    SELECT NOT EXISTS (
      SELECT FROM esperadas e WHERE NOT EXISTS (
        SELECT FROM tabelas t JOIN pg_constraint c ON c.conrelid = t.oid
          JOIN pg_attribute a ON a.attrelid = t.oid AND c.conkey = ARRAY[a.attnum]
          LEFT JOIN tabelas alvo ON alvo.oid = c.confrelid
          LEFT JOIN pg_attribute id ON id.attrelid = alvo.oid AND c.confkey = ARRAY[id.attnum]
         WHERE t.relname = e.tabela AND c.contype::text = e.tipo AND a.attname = e.coluna
           AND c.convalidated AND NOT c.condeferrable
           AND CASE WHEN e.tipo = 'f' THEN alvo.relname = e.alvo AND id.attname = 'id'
                        AND c.confdeltype = 'r' AND c.confupdtype = 'a'
                    ELSE EXISTS (SELECT FROM pg_index i WHERE i.indexrelid = c.conindid
                                  AND i.indisvalid AND i.indisready AND i.indisunique
                                  AND i.indpred IS NULL AND i.indnkeyatts = 1) END
      )
    ) AND NOT EXISTS (
      SELECT FROM tabelas t JOIN pg_constraint c ON c.conrelid = t.oid
       WHERE t.relname IN (?, ?, ?) AND NOT c.convalidated
    ) AND EXISTS (
      SELECT FROM tabelas t JOIN pg_attribute a ON a.attrelid = t.oid
        JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
       WHERE t.relname = 'solicitacoes_svo' AND a.attname = 'canal_origem'
         AND a.attnotnull AND pg_get_expr(d.adbin, t.oid) = '''INTERNA''::character varying'
    ) AND EXISTS (
      SELECT FROM tabelas t JOIN pg_attribute a ON a.attrelid = t.oid
       WHERE t.relname = 'solicitacoes_svo' AND a.attname = 'local_ocorrencia'
         AND a.attnotnull AND format_type(a.atttypid, a.atttypmod) = 'character varying(255)'
    ) AND EXISTS (
      SELECT FROM tabelas t JOIN pg_index i ON i.indrelid = t.oid
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_am am ON am.oid = idx.relam
       WHERE t.relname = 'solicitacoes_svo' AND idx.relname = 'idx_solicitacoes_svo_canal_status_id'
         AND am.amname = 'btree' AND i.indisvalid AND i.indisready AND i.indnkeyatts = 3
         AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indoption::text = '0 0 3'
         AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS k(num, ordem)
                    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.num ORDER BY k.ordem)
             = ARRAY['canal_origem', 'status', 'id']
    ) AND (
      SELECT count(*) = 3 FROM tabelas t
        JOIN pg_trigger g ON g.tgrelid = t.oid
        JOIN pg_proc p ON p.oid = g.tgfoid AND p.pronamespace = t.relnamespace
       WHERE g.tgenabled IN ('O', 'A') AND NOT g.tgisinternal AND NOT p.prosecdef
         AND g.tgqual IS NULL AND g.tgattr::text = ''
         AND (t.relname, g.tgname, p.proname, g.tgtype::int) IN (
           ('solicitacoes_svo_dados_externos', 'trg_validar_vinculo_canal_externo_dados_svo', 'validar_vinculo_canal_externo_svo', 23),
           ('solicitacoes_svo_credenciais_externas', 'trg_validar_vinculo_canal_externo_credenciais_svo', 'validar_vinculo_canal_externo_svo', 23),
           ('solicitacoes_svo', 'trg_proteger_integridade_canal_solicitacao_svo', 'proteger_integridade_canal_solicitacao_svo', 19)
         )
    ) AS compativel
  `, [schema, SOLICITACOES, DADOS, CREDENCIAIS]);
  if (!resultado.compativel) throw new Error('SCRUM-263: catálogo anterior incompatível com a correção.');
}

async function bloquearEscritas(knex) {
  await knex.raw('LOCK TABLE ??, ??, ?? IN ACCESS EXCLUSIVE MODE', [SOLICITACOES, DADOS, CREDENCIAIS]);
}

async function validarDadosExistentes(knex) {
  const { rows: [estado] } = await knex.raw(`
    SELECT EXISTS (
      SELECT FROM solicitacoes_svo s
        LEFT JOIN solicitacoes_svo_dados_externos d ON d.solicitacao_id = s.id
        LEFT JOIN solicitacoes_svo_credenciais_externas c ON c.solicitacao_id = s.id
       WHERE CASE WHEN s.canal_origem = 'EXTERNA' THEN
          d.solicitacao_id IS NULL OR c.solicitacao_id IS NULL
          OR d.endereco_ocorrencia IS DISTINCT FROM s.local_ocorrencia
          OR d.anonimizado_em IS NOT NULL OR d.expurgado_em IS NOT NULL
          OR c.envelope_recuperacao IS NOT NULL OR c.recuperacao_expira_em IS NOT NULL
          OR (c.valida_ate IS NOT NULL AND c.valida_ate IS DISTINCT FROM
               ((d.encerrado_operacional_em AT TIME ZONE 'UTC' + interval '30 days') AT TIME ZONE 'UTC'))
          OR (d.consulta_publica_expira_em IS NOT NULL AND d.consulta_publica_expira_em IS DISTINCT FROM
               ((d.encerrado_operacional_em AT TIME ZONE 'UTC' + interval '30 days') AT TIME ZONE 'UTC'))
          OR (d.encerrado_operacional_em IS NOT NULL AND
               (s.status NOT IN ('CONCLUIDA', 'RECUSADA', 'CANCELADA')
                OR d.encerrado_operacional_em < s.criado_em
                OR d.encerrado_operacional_em > statement_timestamp()))
          ELSE d.solicitacao_id IS NOT NULL OR c.solicitacao_id IS NOT NULL END
    ) AS incompativel
  `);
  if (estado.incompativel) {
    throw new Error('SCRUM-263: existem registros externos incompatíveis. Reconcilie os dados com acesso restrito antes de prosseguir; nenhuma informação foi descartada.');
  }
}

exports.up = async (knex) => {
  const { rows: [contexto] } = await knex.raw('SELECT current_schema() AS schema');
  const appUser = process.env.POSTGRES_APP_USER;
  const bancoDescartavel = process.env.SCRUM263_DB_DESCARTAVEL === '1' &&
    ['127.0.0.1', 'localhost', '::1'].includes(process.env.POSTGRES_HOST);
  if ((!appUser && !bancoDescartavel) || (appUser && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser))) {
    throw new Error('SCRUM-263: configure POSTGRES_APP_USER para uma role de aplicação separada.');
  }

  await bloquearEscritas(knex);
  await validarCatalogoScrum263(knex, contexto.schema);
  await validarDadosExistentes(knex);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION validar_vinculo_canal_externo_svo()
    RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF NOT EXISTS (SELECT FROM solicitacoes_svo WHERE id = NEW.solicitacao_id AND canal_origem = 'EXTERNA') THEN
        RAISE EXCEPTION 'SCRUM-263: vínculo exige solicitação externa.' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;

    CREATE OR REPLACE FUNCTION proteger_integridade_canal_solicitacao_svo()
    RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF (NEW.canal_origem, NEW.protocolo) IS DISTINCT FROM (OLD.canal_origem, OLD.protocolo) THEN
        RAISE EXCEPTION 'SCRUM-263: canal e protocolo são imutáveis.' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;

    ALTER TABLE solicitacoes_svo
      DROP CONSTRAINT chk_solicitacoes_svo_canal_registrante_protocolo,
      ADD CONSTRAINT chk_solicitacoes_svo_canal_registrante_protocolo CHECK (
        (canal_origem = 'INTERNA' AND registrante_id IS NOT NULL AND protocolo IS NULL)
        OR (canal_origem = 'EXTERNA' AND registrante_id IS NULL AND protocolo IS NOT NULL
          AND protocolo ~ '^[A-Z0-9][A-Z0-9-]{10,62}[A-Z0-9]$')
      ),
      ADD CONSTRAINT chk_svo_externa_endereco CHECK (
        canal_origem <> 'EXTERNA' OR length(btrim(local_ocorrencia)) >= 3
      );

    ALTER TABLE solicitacoes_svo_dados_externos
      DROP CONSTRAINT chk_solicitacoes_svo_dados_externos_ciclo_pessoal,
      DROP CONSTRAINT chk_solicitacoes_svo_dados_externos_coordenadas,
      DROP CONSTRAINT chk_solicitacoes_svo_dados_externos_retencao,
      DROP COLUMN endereco_ocorrencia,
      DROP COLUMN consulta_publica_expira_em,
      ALTER COLUMN data_hora_ocorrencia DROP NOT NULL,
      ADD COLUMN consulta_publica_expira_em timestamptz GENERATED ALWAYS AS (
        (encerrado_operacional_em AT TIME ZONE 'UTC' + interval '30 days') AT TIME ZONE 'UTC'
      ) STORED,
      ADD CONSTRAINT chk_solicitacoes_svo_dados_externos_coordenadas CHECK (
        (latitude_ocorrencia IS NULL AND longitude_ocorrencia IS NULL)
        OR (latitude_ocorrencia IS NOT NULL AND longitude_ocorrencia IS NOT NULL
          AND latitude_ocorrencia BETWEEN -90 AND 90 AND longitude_ocorrencia BETWEEN -180 AND 180)
      ),
      ADD CONSTRAINT chk_svo_externa_cancelamento_consistente CHECK (
        cancelamento_status IS NOT NULL OR (
          cancelamento_solicitado_em IS NULL AND cancelamento_motivo IS NULL
          AND cancelamento_decidido_por IS NULL AND cancelamento_decidido_em IS NULL
          AND cancelamento_justificativa_decisao IS NULL
        )
      ),
      ADD CONSTRAINT chk_svo_externa_retencao CHECK (
        (retencao_ate IS NULL OR (encerrado_operacional_em IS NOT NULL AND
          retencao_ate >= ((encerrado_operacional_em AT TIME ZONE 'UTC' + interval '12 months') AT TIME ZONE 'UTC')))
        AND (anonimizado_em IS NULL OR (retencao_ate IS NOT NULL AND anonimizado_em >= retencao_ate AND NOT preservacao_legal))
        AND ((expurgado_em IS NULL AND expurgado_por IS NULL AND expurgo_motivo IS NULL)
          OR (expurgado_em IS NOT NULL AND retencao_ate IS NOT NULL AND expurgado_em >= retencao_ate
            AND NOT preservacao_legal AND expurgado_por IS NOT NULL AND expurgo_motivo IS NOT NULL
            AND expurgo_motivo ~ '^[A-Z][A-Z0-9_]{4,99}$'))
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

    ALTER TABLE solicitacoes_svo_credenciais_externas
      DROP CONSTRAINT chk_solicitacoes_svo_credenciais_idempotencia,
      DROP CONSTRAINT chk_solicitacoes_svo_credenciais_ciclo,
      DROP COLUMN envelope_recuperacao,
      DROP COLUMN recuperacao_expira_em,
      DROP COLUMN valida_ate,
      ALTER COLUMN chave_idempotencia_criacao SET NOT NULL,
      ALTER COLUMN payload_criacao_digest SET NOT NULL,
      ADD CONSTRAINT chk_svo_credenciais_idempotencia CHECK (
        length(chave_idempotencia_criacao) >= 8 AND chave_idempotencia_criacao !~ '[[:space:][:cntrl:]]'
        AND payload_criacao_digest ~ '^[0-9a-f]{64}$'
        AND (prova_tentativa_digest IS NULL OR prova_tentativa_digest ~ '^[0-9a-f]{64}$')
      ),
      ADD CONSTRAINT chk_svo_credenciais_ciclo CHECK (
        ((revogada_em IS NULL AND revogada_motivo IS NULL) OR
         (revogada_em IS NOT NULL AND revogada_em >= emitida_em AND revogada_motivo IS NOT NULL
           AND length(btrim(revogada_motivo)) >= 3))
        AND (ultimo_acesso_em IS NULL OR ultimo_acesso_em >= emitida_em)
        AND atualizado_em >= emitida_em
      );

    CREATE INDEX idx_svo_consulta_publica_expira ON solicitacoes_svo_dados_externos (consulta_publica_expira_em)
      WHERE consulta_publica_expira_em IS NOT NULL;

    CREATE FUNCTION verificar_registro_externo_svo()
    RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    DECLARE
      alvo integer;
      solicitacao solicitacoes_svo%ROWTYPE;
      dados solicitacoes_svo_dados_externos%ROWTYPE;
      tem_credencial boolean;
    BEGIN
      IF TG_TABLE_NAME = 'solicitacoes_svo' THEN
        alvo := NEW.id;
      ELSIF TG_OP = 'DELETE' THEN
        alvo := OLD.solicitacao_id;
      ELSE
        IF TG_OP = 'UPDATE' AND NEW.solicitacao_id <> OLD.solicitacao_id THEN
          RAISE EXCEPTION 'SCRUM-263: vínculo externo imutável.' USING ERRCODE = '23514';
        END IF;
        alvo := NEW.solicitacao_id;
      END IF;

      SELECT * INTO solicitacao FROM solicitacoes_svo WHERE id = alvo;
      IF NOT FOUND OR solicitacao.canal_origem <> 'EXTERNA' THEN RETURN NULL; END IF;

      SELECT * INTO dados FROM solicitacoes_svo_dados_externos WHERE solicitacao_id = alvo;
      SELECT EXISTS (SELECT FROM solicitacoes_svo_credenciais_externas WHERE solicitacao_id = alvo) INTO tem_credencial;
      IF dados.solicitacao_id IS NULL THEN
        RAISE EXCEPTION 'SCRUM-263: dados externos obrigatórios na mesma transação.' USING ERRCODE = '23514';
      END IF;

      IF dados.encerrado_operacional_em IS NOT NULL AND (
        solicitacao.status NOT IN ('CONCLUIDA', 'RECUSADA', 'CANCELADA')
        OR dados.encerrado_operacional_em < solicitacao.criado_em
        OR dados.encerrado_operacional_em > statement_timestamp()
      ) THEN
        RAISE EXCEPTION 'SCRUM-263: encerramento operacional incompatível.' USING ERRCODE = '23514';
      END IF;

      IF dados.anonimizado_em IS NOT NULL OR dados.expurgado_em IS NOT NULL THEN
        IF tem_credencial OR solicitacao.local_ocorrencia <> 'Endereço removido'
          OR solicitacao.dados_solicitante <> 'Solicitação externa'
          OR solicitacao.observacoes IS NOT NULL OR solicitacao.motivo_recusa IS NOT NULL
          OR dados.anonimizado_em > statement_timestamp() OR dados.expurgado_em > statement_timestamp()
        THEN
          RAISE EXCEPTION 'SCRUM-263: tratamento de dados externos incompleto ou antecipado.' USING ERRCODE = '23514';
        END IF;
      ELSIF NOT tem_credencial THEN
        RAISE EXCEPTION 'SCRUM-263: credencial externa obrigatória na mesma transação.' USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END $$;

    CREATE FUNCTION proteger_prazos_externos_svo()
    RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF TG_TABLE_NAME = 'solicitacoes_svo_dados_externos' THEN
        IF OLD.encerrado_operacional_em IS NOT NULL AND
          NEW.encerrado_operacional_em IS DISTINCT FROM OLD.encerrado_operacional_em THEN
          RAISE EXCEPTION 'SCRUM-263: encerramento operacional imutável.' USING ERRCODE = '23514';
        END IF;
      ELSIF OLD.revogada_em IS NOT NULL AND
        (NEW.revogada_em, NEW.revogada_motivo) IS DISTINCT FROM (OLD.revogada_em, OLD.revogada_motivo) THEN
        RAISE EXCEPTION 'SCRUM-263: revogação de credencial imutável.' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END $$;

    CREATE CONSTRAINT TRIGGER trg_svo_externo_completo
      AFTER INSERT OR UPDATE OF canal_origem, status, local_ocorrencia, dados_solicitante, observacoes, motivo_recusa, criado_em
      ON solicitacoes_svo DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      WHEN (NEW.canal_origem = 'EXTERNA') EXECUTE FUNCTION verificar_registro_externo_svo();
    CREATE CONSTRAINT TRIGGER trg_svo_dados_externos_completos
      AFTER INSERT OR DELETE OR UPDATE OF solicitacao_id, encerrado_operacional_em, anonimizado_em, expurgado_em
      ON solicitacoes_svo_dados_externos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION verificar_registro_externo_svo();
    CREATE CONSTRAINT TRIGGER trg_svo_credencial_externa_completa
      AFTER INSERT OR DELETE OR UPDATE OF solicitacao_id
      ON solicitacoes_svo_credenciais_externas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION verificar_registro_externo_svo();

    CREATE TRIGGER trg_svo_encerramento_imutavel
      BEFORE UPDATE OF encerrado_operacional_em ON solicitacoes_svo_dados_externos
      FOR EACH ROW EXECUTE FUNCTION proteger_prazos_externos_svo();
    CREATE TRIGGER trg_svo_revogacao_imutavel
      BEFORE UPDATE OF revogada_em, revogada_motivo ON solicitacoes_svo_credenciais_externas
      FOR EACH ROW EXECUTE FUNCTION proteger_prazos_externos_svo();

    REVOKE ALL ON FUNCTION verificar_registro_externo_svo(), proteger_prazos_externos_svo() FROM PUBLIC;
  `);

  await aplicarPrivilegiosScrum263(knex, contexto.schema, appUser);
};

exports.down = async (knex) => {
  await bloquearEscritas(knex);
  if (await knex(SOLICITACOES).where('canal_origem', 'EXTERNA').first('id') ||
      await knex(DADOS).first('solicitacao_id') || await knex(CREDENCIAIS).first('solicitacao_id')) {
    throw new Error('Rollback bloqueado: existem dados externos SCRUM-263. Utilize roll-forward.');
  }
  // As duas tabelas externas estão vazias. Reexecuta a definição histórica, preservando todos os registros internos.
  await knex.raw(`
    DROP TRIGGER trg_svo_externo_completo ON solicitacoes_svo;
    DROP TRIGGER trg_proteger_integridade_canal_solicitacao_svo ON solicitacoes_svo;
    DROP TABLE solicitacoes_svo_credenciais_externas, solicitacoes_svo_dados_externos;
    DROP FUNCTION verificar_registro_externo_svo(), proteger_prazos_externos_svo(),
      validar_vinculo_canal_externo_svo(), proteger_integridade_canal_solicitacao_svo();
    DROP INDEX idx_solicitacoes_svo_canal_status_id;
    ALTER TABLE solicitacoes_svo DROP CONSTRAINT chk_svo_externa_endereco,
      DROP COLUMN canal_origem, DROP COLUMN protocolo, ALTER COLUMN registrante_id SET NOT NULL;
  `);
  await anterior.up(knex);
};
