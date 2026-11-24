import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const provisionarModule = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrationScrum228 = require('../../database/migrations/20261124200000_scrum_228_notificacao_outbox.js') as {
  up: (knex: unknown) => Promise<void>;
  down: (knex: unknown) => Promise<void>;
  validarCatalogoScrum228: (knex: unknown) => Promise<void>;
};

describe('Contrato de banco, migration e privilégios da SCRUM-228 (outbox transacional)', () => {
  function criarKnexScrum228Mock(opcoes?: {
    schemaAtual?: string;
    tabelasBaseCount?: number;
    tabelaOutboxPreexistente?: boolean;
    tipoPayloadPush?: string;
    tamanhoEventoTipo?: number;
    omitirConstraint?: string;
    omitirIndice?: string;
    totalOutbox?: number;
    roleAppPresente?: boolean;
  }) {
    const sqlExecutados: { sql: string; bindings?: unknown[] }[] = [];

    const raw = vi.fn(async (sql: string, bindings?: unknown[]) => {
      sqlExecutados.push({ sql, bindings });

      if (sql.includes('current_schema()')) {
        return { rows: [{ schema_atual: opcoes?.schemaAtual ?? 'public' }] };
      }

      if (sql.includes('FROM information_schema.tables') && sql.includes("table_name = 'usuarios'")) {
        const qtd = opcoes?.tabelasBaseCount ?? 1;
        return {
          rows: Array.from({ length: qtd }, () => ({ table_name: 'usuarios' })),
        };
      }

      if (
        sql.includes('FROM information_schema.tables') &&
        sql.includes("table_name = 'notificacao_outbox'")
      ) {
        return {
          rows: opcoes?.tabelaOutboxPreexistente ? [{ '?column?': 1 }] : [],
        };
      }

      if (
        sql.includes('FROM information_schema.columns') &&
        sql.includes("table_name = 'notificacao_outbox'")
      ) {
        return {
          rows: [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'notificacao_id', data_type: 'integer', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'usuario_id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            {
              column_name: 'evento_tipo',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: opcoes?.tamanhoEventoTipo ?? 64,
            },
            { column_name: 'categoria', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 60 },
            { column_name: 'operacao', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 20 },
            { column_name: 'referencia_tipo', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 40 },
            { column_name: 'referencia_id', data_type: 'integer', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'ocorrencia_versao', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 120 },
            { column_name: 'chave_idempotencia', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 190 },
            { column_name: 'canal', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 20 },
            {
              column_name: 'payload_push',
              data_type: opcoes?.tipoPayloadPush ?? 'jsonb',
              is_nullable: 'NO',
              character_maximum_length: null,
            },
            { column_name: 'status', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 24 },
            { column_name: 'tentativas', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'max_tentativas', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            {
              column_name: 'proxima_execucao_em',
              data_type: 'timestamp with time zone',
              is_nullable: 'NO',
              character_maximum_length: null,
            },
            { column_name: 'bloqueado_ate', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'ultimo_erro', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 500 },
            { column_name: 'ultimo_status_http', data_type: 'integer', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'processado_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'criado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'atualizado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
          ],
        };
      }

      if (sql.includes('FROM pg_constraint')) {
        const todas = [
          {
            table_name: 'notificacao_outbox',
            conname: 'fk_notificacao_outbox_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE',
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'uq_notificacao_outbox_usuario_chave_idempotencia',
            contype: 'u',
            def: 'UNIQUE (usuario_id, chave_idempotencia)',
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'uq_notificacao_outbox_evento_destinatario_ocorrencia',
            contype: 'u',
            def: 'UNIQUE (evento_tipo, usuario_id, canal, ocorrencia_versao)',
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_campos_obrigatorios',
            contype: 'c',
            def: 'CHECK (((length(btrim((evento_tipo)::text)) > 0) AND (length(btrim((categoria)::text)) > 0) AND (length(btrim((ocorrencia_versao)::text)) > 0) AND (length(btrim((chave_idempotencia)::text)) > 0) AND (notificacao_id IS NULL OR notificacao_id > 0) AND (ultimo_erro IS NULL OR ((length(btrim((ultimo_erro)::text)) > 0) AND (char_length((ultimo_erro)::text) <= 500)))))',
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_operacao',
            contype: 'c',
            def: "CHECK (((operacao)::text = ANY (ARRAY['Administrativo'::text, 'SVO'::text])))",
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_canal',
            contype: 'c',
            def: "CHECK (((canal)::text = ANY (ARRAY['WEB_PUSH'::text])))",
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_status',
            contype: 'c',
            def: "CHECK (((status)::text = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text, 'ENVIADO'::text, 'FALHA_DEFINITIVA'::text, 'IGNORADO'::text])))",
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_tentativas',
            contype: 'c',
            def: 'CHECK (((tentativas >= 0) AND (max_tentativas >= 1) AND (tentativas <= max_tentativas)))',
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_referencia_coerente',
            contype: 'c',
            def: 'CHECK (((referencia_tipo IS NULL AND referencia_id IS NULL) OR (referencia_tipo IS NOT NULL AND length(btrim((referencia_tipo)::text)) > 0 AND referencia_id IS NOT NULL AND referencia_id > 0)))',
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_payload_objeto',
            contype: 'c',
            def: "CHECK ((jsonb_typeof(payload_push) = 'object'::text))",
          },
          {
            table_name: 'notificacao_outbox',
            conname: 'chk_notificacao_outbox_processamento_coerente',
            contype: 'c',
            def: "CHECK ((((status)::text = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text])) AND (processado_em IS NULL)) OR (((status)::text = ANY (ARRAY['ENVIADO'::text, 'FALHA_DEFINITIVA'::text, 'IGNORADO'::text])) AND (processado_em IS NOT NULL) AND (processado_em >= criado_em)))",
          },
        ];

        return {
          rows: todas.filter((c) => `${c.table_name}.${c.conname}` !== opcoes?.omitirConstraint),
        };
      }

      if (sql.includes('FROM pg_indexes')) {
        const todosIdx = [
          {
            indexname: 'idx_notificacao_outbox_fila_pendente',
            indexdef:
              "CREATE INDEX idx_notificacao_outbox_fila_pendente ON public.notificacao_outbox USING btree (proxima_execucao_em, id) WHERE ((status)::text = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text]))",
          },
          {
            indexname: 'idx_notificacao_outbox_usuario_status',
            indexdef:
              'CREATE INDEX idx_notificacao_outbox_usuario_status ON public.notificacao_outbox USING btree (usuario_id, status, criado_em DESC)',
          },
          {
            indexname: 'idx_notificacao_outbox_referencia',
            indexdef:
              'CREATE INDEX idx_notificacao_outbox_referencia ON public.notificacao_outbox USING btree (referencia_tipo, referencia_id) WHERE ((referencia_tipo IS NOT NULL) AND (referencia_id IS NOT NULL))',
          },
          {
            indexname: 'idx_notificacao_outbox_retencao_terminal',
            indexdef:
              "CREATE INDEX idx_notificacao_outbox_retencao_terminal ON public.notificacao_outbox USING btree (processado_em, status) WHERE ((status)::text = ANY (ARRAY['ENVIADO'::text, 'FALHA_DEFINITIVA'::text, 'IGNORADO'::text]))",
          },
        ];

        return {
          rows: todosIdx.filter((i) => i.indexname !== opcoes?.omitirIndice),
        };
      }

      return { rows: [] };
    });

    const knexMock: any = (tabela: string) => ({
      where: () => ({
        first: async () =>
          tabela === 'pg_roles' && (opcoes?.roleAppPresente ?? true)
            ? { rolname: 'frotas_app' }
            : undefined,
      }),
      count: () => ({
        first: async () => ({
          total: String(tabela === 'notificacao_outbox' ? (opcoes?.totalOutbox ?? 0) : 0),
        }),
      }),
    });
    knexMock.raw = raw;

    return { knexMock, sqlExecutados };
  }

  it('não utiliza IF EXISTS nem IF NOT EXISTS cegos no código-fonte da migration SCRUM-228', () => {
    const caminhoMigration = path.resolve(
      __dirname,
      '../../database/migrations/20261124200000_scrum_228_notificacao_outbox.js'
    );
    const codigoFonte = fs.readFileSync(caminhoMigration, 'utf-8');

    expect(codigoFonte).not.toMatch(/\bIF\s+EXISTS\b/i);
    expect(codigoFonte).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
  });

  it('define contrato alinhado à Seção 6.1 do Plano (ON DELETE CASCADE, evento_tipo VARCHAR(64), operacao Administrativo/SVO)', async () => {
    const { knexMock, sqlExecutados } = criarKnexScrum228Mock();
    await migrationScrum228.up(knexMock);

    const ddlCreate = sqlExecutados.find((item) =>
      item.sql.includes('CREATE TABLE notificacao_outbox')
    );
    expect(ddlCreate).toBeDefined();
    expect(ddlCreate?.sql).toContain('REFERENCES usuarios(id) ON DELETE CASCADE');
    expect(ddlCreate?.sql).toContain('evento_tipo VARCHAR(64) NOT NULL');
    expect(ddlCreate?.sql).toContain('referencia_tipo VARCHAR(40) NULL DEFAULT NULL');
    expect(ddlCreate?.sql).toContain("CHECK (operacao IN ('Administrativo', 'SVO'))");
  });

  it('bloqueia up quando a tabela base usuarios não está presente no schema alvo', async () => {
    const semBase = criarKnexScrum228Mock({ tabelasBaseCount: 0 });
    await expect(migrationScrum228.up(semBase.knexMock)).rejects.toThrow(
      /tabela base usuarios ausente no schema alvo/
    );
  });

  it('rejeita estruturas preexistentes incompatíveis em validarCatalogoScrum228 (tipo, limite, constraint e índice)', async () => {
    const tipoInvalido = criarKnexScrum228Mock({ tipoPayloadPush: 'text' });
    await expect(migrationScrum228.validarCatalogoScrum228(tipoInvalido.knexMock)).rejects.toThrow(
      /Estrutura incompativel em notificacao_outbox\.payload_push/
    );

    const tamanhoInvalido = criarKnexScrum228Mock({ tamanhoEventoTipo: 120 });
    await expect(
      migrationScrum228.validarCatalogoScrum228(tamanhoInvalido.knexMock)
    ).rejects.toThrow(/Estrutura incompativel em notificacao_outbox\.evento_tipo/);

    const semConstraint = criarKnexScrum228Mock({
      omitirConstraint: 'notificacao_outbox.uq_notificacao_outbox_evento_destinatario_ocorrencia',
    });
    await expect(
      migrationScrum228.validarCatalogoScrum228(semConstraint.knexMock)
    ).rejects.toThrow(
      /Constraint obrigatoria ausente ou incompativel: notificacao_outbox\.uq_notificacao_outbox_evento_destinatario_ocorrencia/
    );

    const semIndice = criarKnexScrum228Mock({
      omitirIndice: 'idx_notificacao_outbox_fila_pendente',
    });
    await expect(migrationScrum228.validarCatalogoScrum228(semIndice.knexMock)).rejects.toThrow(
      /Indice obrigatorio ausente ou incompativel: idx_notificacao_outbox_fila_pendente/
    );
  });

  it('interpola o schema atual (current_schema) nos comandos REVOKE e GRANT da role da aplicação', async () => {
    const appUserAnterior = process.env.POSTGRES_APP_USER;
    process.env.POSTGRES_APP_USER = 'frotas_app';
    try {
      const { knexMock, sqlExecutados } = criarKnexScrum228Mock({
        schemaAtual: 'schema_isolado_228',
        roleAppPresente: true,
      });

      await migrationScrum228.up(knexMock);

      const cmdRevoke = sqlExecutados.find((item) =>
        item.sql.includes('REVOKE ALL PRIVILEGES ON TABLE ??.notificacao_outbox FROM ??')
      );
      expect(cmdRevoke).toBeDefined();
      expect(cmdRevoke?.bindings).toEqual(['schema_isolado_228', 'frotas_app']);

      const cmdGrant = sqlExecutados.find((item) =>
        item.sql.includes('GRANT SELECT, INSERT, UPDATE ON TABLE ??.notificacao_outbox TO ??')
      );
      expect(cmdGrant).toBeDefined();
      expect(cmdGrant?.bindings).toEqual(['schema_isolado_228', 'frotas_app']);
    } finally {
      if (appUserAnterior === undefined) {
        delete process.env.POSTGRES_APP_USER;
      } else {
        process.env.POSTGRES_APP_USER = appUserAnterior;
      }
    }
  });

  it('bloqueia rollback (down) quando há registros persistidos em notificacao_outbox', async () => {
    const comDados = criarKnexScrum228Mock({ totalOutbox: 2 });
    await expect(migrationScrum228.down(comDados.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem registros em notificacao_outbox/
    );
  });

  it('executa DROP estrito (sem IF EXISTS) no down quando não há dados operacionais', async () => {
    const limpo = criarKnexScrum228Mock({ totalOutbox: 0 });
    await migrationScrum228.down(limpo.knexMock);

    const ddlDown = limpo.sqlExecutados.find((item) =>
      item.sql.includes('DROP TABLE notificacao_outbox')
    );
    expect(ddlDown).toBeDefined();
    expect(ddlDown?.sql).not.toContain('IF EXISTS');
    expect(ddlDown?.sql).toContain('DROP INDEX idx_notificacao_outbox_fila_pendente;');
    expect(ddlDown?.sql).toContain('DROP INDEX idx_notificacao_outbox_retencao_terminal;');
  });

  it('rejeita role da aplicação que possua DELETE na tabela notificacao_outbox', () => {
    const baseRole = {
      rolname: 'frotas_app',
      rolcanlogin: true,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      rolinherit: false,
      rolesHerdadas: [] as string[],
      podeCriarNoPublic: false,
      podeUsarPublic: true,
      podeAcessarMigrations: false,
      podeDeletarHistoricoSvo: false,
      podeDeletarEvidenciasOdometro: false,
      podeDeletarNotificacaoOutbox: true,
      privilegiosExcessivosTabelas: [] as string[],
    };

    expect(() => provisionarModule.validarEstadoMinimoPrivilegio(baseRole)).toThrow(
      /nao pode ter privilegio DELETE sobre a tabela notificacao_outbox/
    );
  });
});
