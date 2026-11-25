import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const provisionarModule = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrationScrum236 = require('../../database/migrations/20261124203000_scrum_236_push_subscriptions_e_preferencias.js') as {
  up: (knex: unknown) => Promise<void>;
  down: (knex: unknown) => Promise<void>;
  validarCatalogoScrum236: (knex: unknown) => Promise<void>;
};

describe('Contrato de banco, migration e privilÃƒÂ©gios da SCRUM-236 (assinaturas Push e preferÃƒÂªncias)', () => {
  function criarKnexScrum236Mock(opcoes?: {
    schemaAtual?: string;
    tabelasBaseCount?: number;
    tipoEndpoint?: string;
    tamanhoUserAgent?: number;
    defaultHabilitado?: string;
    omitirConstraint?: string;
    omitirIndice?: string;
    omitirTrigger?: boolean;
    totalPush?: number;
    totalPreferencias?: number;
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
        (sql.includes("table_name = 'push_subscriptions'") ||
          sql.includes("table_name = 'preferencias_notificacao'"))
      ) {
        return { rows: [] };
      }

      if (
        sql.includes('FROM information_schema.columns') &&
        sql.includes("table_name = 'push_subscriptions'")
      ) {
        return {
          rows: [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'usuario_id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            {
              column_name: 'endpoint',
              data_type: opcoes?.tipoEndpoint ?? 'text',
              is_nullable: 'NO',
              character_maximum_length: null,
            },
            { column_name: 'p256dh', data_type: 'text', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'auth', data_type: 'text', is_nullable: 'NO', character_maximum_length: null },
            {
              column_name: 'user_agent',
              data_type: 'character varying',
              is_nullable: 'YES',
              character_maximum_length: opcoes?.tamanhoUserAgent ?? 255,
            },
            { column_name: 'status', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 20 },
            { column_name: 'ativa', data_type: 'boolean', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'falhas_consecutivas', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'ultimo_status_http', data_type: 'integer', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'ultimo_sucesso_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'ultimo_erro_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'revogada_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'expirada_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'criado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'atualizado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
          ],
        };
      }

      if (
        sql.includes('FROM information_schema.columns') &&
        sql.includes("table_name = 'preferencias_notificacao'")
      ) {
        return {
          rows: [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null, column_default: null },
            { column_name: 'usuario_id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null, column_default: null },
            { column_name: 'categoria', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 60, column_default: null },
            { column_name: 'canal', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 20, column_default: "'WEB_PUSH'::character varying" },
            {
              column_name: 'habilitado',
              data_type: 'boolean',
              is_nullable: 'NO',
              character_maximum_length: null,
              column_default: opcoes?.defaultHabilitado ?? 'false',
            },
            { column_name: 'criado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null, column_default: 'CURRENT_TIMESTAMP' },
            { column_name: 'atualizado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null, column_default: 'CURRENT_TIMESTAMP' },
          ],
        };
      }

      if (sql.includes('FROM pg_constraint')) {
        const todas = [
          {
            table_name: 'push_subscriptions',
            conname: 'fk_push_subscriptions_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE',
          },
          {
            table_name: 'push_subscriptions',
            conname: 'uq_push_subscriptions_endpoint',
            contype: 'u',
            def: 'UNIQUE (endpoint)',
          },
          {
            table_name: 'push_subscriptions',
            conname: 'chk_push_subscriptions_endpoint_https',
            contype: 'c',
            def: "CHECK (((length(btrim(endpoint)) >= 16) AND (char_length(endpoint) <= 2048) AND (endpoint = btrim(endpoint)) AND (endpoint ~~ 'https://%'::text) AND (endpoint !~ '[\\\\[:space:][:cntrl:]]'::text)))",
          },
          {
            table_name: 'push_subscriptions',
            conname: 'chk_push_subscriptions_chaves_protegidas',
            contype: 'c',
            def: "CHECK (((length(btrim(p256dh)) >= 16) AND (char_length(p256dh) <= 512) AND (p256dh = btrim(p256dh)) AND (p256dh ~ '^[A-Za-z0-9+/_=-]+$'::text) AND (length(btrim(auth)) >= 8) AND (char_length(auth) <= 256) AND (auth = btrim(auth)) AND (auth ~ '^[A-Za-z0-9+/_=-]+$'::text) AND (p256dh <> auth)))",
          },
          {
            table_name: 'push_subscriptions',
            conname: 'chk_push_subscriptions_user_agent',
            contype: 'c',
            def: "CHECK ((user_agent IS NULL OR ((length(btrim((user_agent)::text)) > 0) AND (char_length((user_agent)::text) <= 255) AND ((user_agent)::text !~ '[[:cntrl:]]'::text))))",
          },
          {
            table_name: 'push_subscriptions',
            conname: 'chk_push_subscriptions_status_ciclo',
            contype: 'c',
            def: "CHECK ((((status)::text = 'ATIVA'::text) AND (ativa = true) AND (revogada_em IS NULL) AND (expirada_em IS NULL)) OR (((status)::text = 'REVOGADA'::text) AND (ativa = false) AND (revogada_em IS NOT NULL) AND (revogada_em >= criado_em)) OR (((status)::text = ANY (ARRAY['EXPIRADA'::text, 'INVALIDA'::text])) AND (ativa = false) AND ((expirada_em IS NOT NULL) OR (revogada_em IS NOT NULL) OR (ultimo_erro_em IS NOT NULL))))",
          },
          {
            table_name: 'push_subscriptions',
            conname: 'chk_push_subscriptions_falhas',
            contype: 'c',
            def: 'CHECK (((falhas_consecutivas >= 0) AND (atualizado_em >= criado_em)))',
          },
          {
            table_name: 'preferencias_notificacao',
            conname: 'fk_preferencias_notificacao_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE',
          },
          {
            table_name: 'preferencias_notificacao',
            conname: 'uq_preferencias_notificacao_usuario_categoria_canal',
            contype: 'u',
            def: 'UNIQUE (usuario_id, categoria, canal)',
          },
          {
            table_name: 'preferencias_notificacao',
            conname: 'chk_preferencias_notificacao_categoria',
            contype: 'c',
            def: "CHECK (((length(btrim((categoria)::text)) >= 2) AND (char_length((categoria)::text) <= 60) AND ((categoria)::text = btrim((categoria)::text)) AND ((categoria)::text ~ '^[A-Z][A-Z0-9_]{1,59}$'::text)))",
          },
          {
            table_name: 'preferencias_notificacao',
            conname: 'chk_preferencias_notificacao_canal',
            contype: 'c',
            def: "CHECK (((canal)::text = ANY (ARRAY['WEB_PUSH'::text])))",
          },
          {
            table_name: 'preferencias_notificacao',
            conname: 'chk_preferencias_notificacao_timestamps',
            contype: 'c',
            def: 'CHECK ((atualizado_em >= criado_em))',
          },
        ];

        return {
          rows: todas.filter((c) => `${c.table_name}.${c.conname}` !== opcoes?.omitirConstraint),
        };
      }

      if (sql.includes('FROM pg_indexes')) {
        const todosIdx = [
          {
            indexname: 'idx_push_subscriptions_usuario_id',
            indexdef:
              'CREATE INDEX idx_push_subscriptions_usuario_id ON public.push_subscriptions USING btree (usuario_id)',
          },
          {
            indexname: 'idx_push_subscriptions_usuario_ativas',
            indexdef:
              'CREATE INDEX idx_push_subscriptions_usuario_ativas ON public.push_subscriptions USING btree (usuario_id, atualizado_em DESC, id DESC) WHERE (ativa = true)',
          },
          {
            indexname: 'idx_push_subscriptions_retencao_inativas',
            indexdef:
              'CREATE INDEX idx_push_subscriptions_retencao_inativas ON public.push_subscriptions USING btree (atualizado_em, status) WHERE (ativa = false)',
          },
          {
            indexname: 'idx_preferencias_notificacao_usuario',
            indexdef:
              'CREATE INDEX idx_preferencias_notificacao_usuario ON public.preferencias_notificacao USING btree (usuario_id, canal)',
          },
        ];

        return {
          rows: todosIdx.filter((i) => i.indexname !== opcoes?.omitirIndice),
        };
      }

      if (sql.includes('FROM pg_trigger')) {
        return {
          rows: opcoes?.omitirTrigger
            ? []
            : [{ tgname: 'trg_validar_regras_push_subscriptions' }],
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
          total: String(
            tabela === 'push_subscriptions'
              ? (opcoes?.totalPush ?? 0)
              : tabela === 'preferencias_notificacao'
                ? (opcoes?.totalPreferencias ?? 0)
                : 0
          ),
        }),
      }),
    });
    knexMock.raw = raw;

    return { knexMock, sqlExecutados };
  }

  it('nÃƒÂ£o utiliza IF EXISTS nem IF NOT EXISTS cegos no cÃƒÂ³digo-fonte da migration SCRUM-236', () => {
    const caminhoMigration = path.resolve(
      __dirname,
      '../../database/migrations/20261124203000_scrum_236_push_subscriptions_e_preferencias.js'
    );
    const codigoFonte = fs.readFileSync(caminhoMigration, 'utf-8');

    expect(codigoFonte).not.toMatch(/\bIF\s+EXISTS\b/i);
    expect(codigoFonte).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
  });

  it('define contrato com ON DELETE CASCADE, renovaÃƒÂ§ÃƒÂ£o idempotente no limite de 5 dispositivos, proteÃƒÂ§ÃƒÂ£o Base64 de chaves e padrÃƒÂ£o conservador DEFAULT false', async () => {
    const { knexMock, sqlExecutados } = criarKnexScrum236Mock();
    await migrationScrum236.up(knexMock);

    const ddlPush = sqlExecutados.find((item) => item.sql.includes('CREATE TABLE push_subscriptions'));
    expect(ddlPush).toBeDefined();
    expect(ddlPush?.sql).toContain('REFERENCES usuarios(id) ON DELETE CASCADE');
    expect(ddlPush?.sql).toContain("current_setting('fsph.push_max_dispositivos_por_usuario', true)");
    expect(ddlPush?.sql).toContain('limite_dispositivos integer := 5;');
    expect(ddlPush?.sql).toContain('AND endpoint <> NEW.endpoint');
    expect(ddlPush?.sql).toContain(
      'Transferencia de endpoint de push_subscriptions entre usuarios distintos nao e permitida.'
    );

    const ddlPref = sqlExecutados.find((item) =>
      item.sql.includes('CREATE TABLE preferencias_notificacao')
    );
    expect(ddlPref).toBeDefined();
    expect(ddlPref?.sql).toContain('REFERENCES usuarios(id) ON DELETE CASCADE');
    expect(ddlPref?.sql).toContain('habilitado BOOLEAN NOT NULL DEFAULT false');
  });

  it('bloqueia up quando a tabela base usuarios nÃƒÂ£o estÃƒÂ¡ presente no schema alvo', async () => {
    const semBase = criarKnexScrum236Mock({ tabelasBaseCount: 0 });
    await expect(migrationScrum236.up(semBase.knexMock)).rejects.toThrow(
      /tabela base usuarios ausente no schema alvo/
    );
  });

  it('rejeita estruturas preexistentes incompatÃƒÂ­veis em validarCatalogoScrum236 (tipo, limite, default nÃƒÂ£o conservador, constraint, ÃƒÂ­ndice e trigger)', async () => {
    const tipoInvalido = criarKnexScrum236Mock({ tipoEndpoint: 'character varying' });
    await expect(migrationScrum236.validarCatalogoScrum236(tipoInvalido.knexMock)).rejects.toThrow(
      /Estrutura incompativel em push_subscriptions\.endpoint/
    );

    const tamanhoInvalido = criarKnexScrum236Mock({ tamanhoUserAgent: 100 });
    await expect(
      migrationScrum236.validarCatalogoScrum236(tamanhoInvalido.knexMock)
    ).rejects.toThrow(/Estrutura incompativel em push_subscriptions\.user_agent/);

    const defaultNaoConservador = criarKnexScrum236Mock({ defaultHabilitado: 'true' });
    await expect(
      migrationScrum236.validarCatalogoScrum236(defaultNaoConservador.knexMock)
    ).rejects.toThrow(/padrao conservador exige column_default=false/);

    const semConstraint = criarKnexScrum236Mock({
      omitirConstraint: 'push_subscriptions.uq_push_subscriptions_endpoint',
    });
    await expect(
      migrationScrum236.validarCatalogoScrum236(semConstraint.knexMock)
    ).rejects.toThrow(
      /Constraint obrigatoria ausente ou incompativel: push_subscriptions\.uq_push_subscriptions_endpoint/
    );

    const semIndice = criarKnexScrum236Mock({
      omitirIndice: 'idx_push_subscriptions_usuario_id',
    });
    await expect(migrationScrum236.validarCatalogoScrum236(semIndice.knexMock)).rejects.toThrow(
      /Indice obrigatorio ausente ou incompativel: idx_push_subscriptions_usuario_id/
    );

    const semTrigger = criarKnexScrum236Mock({ omitirTrigger: true });
    await expect(migrationScrum236.validarCatalogoScrum236(semTrigger.knexMock)).rejects.toThrow(
      /Trigger obrigatoria ausente em push_subscriptions: trg_validar_regras_push_subscriptions/
    );
  });

  it('interpola o schema atual (current_schema) nos comandos REVOKE e GRANT da role da aplicaÃƒÂ§ÃƒÂ£o', async () => {
    const appUserAnterior = process.env.POSTGRES_APP_USER;
    process.env.POSTGRES_APP_USER = 'frotas_app';
    try {
      const { knexMock, sqlExecutados } = criarKnexScrum236Mock({
        schemaAtual: 'schema_isolado_236',
        roleAppPresente: true,
      });

      await migrationScrum236.up(knexMock);

      const cmdRevoke = sqlExecutados.find((item) =>
        item.sql.includes(
          'REVOKE ALL PRIVILEGES ON TABLE ??.push_subscriptions, ??.preferencias_notificacao FROM ??'
        )
      );
      expect(cmdRevoke).toBeDefined();
      expect(cmdRevoke?.bindings).toEqual([
        'schema_isolado_236',
        'schema_isolado_236',
        'frotas_app',
      ]);

      const cmdGrantPref = sqlExecutados.find((item) =>
        item.sql.includes('GRANT SELECT, INSERT, UPDATE ON TABLE ??.preferencias_notificacao TO ??')
      );
      expect(cmdGrantPref).toBeDefined();
      expect(cmdGrantPref?.bindings).toEqual(['schema_isolado_236', 'frotas_app']);
    } finally {
      if (appUserAnterior === undefined) {
        delete process.env.POSTGRES_APP_USER;
      } else {
        process.env.POSTGRES_APP_USER = appUserAnterior;
      }
    }
  });

  it('bloqueia rollback (down) quando hÃƒÂ¡ registros em push_subscriptions ou preferencias_notificacao', async () => {
    const comPush = criarKnexScrum236Mock({ totalPush: 1 });
    await expect(migrationScrum236.down(comPush.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem registros em push_subscriptions/
    );

    const comPref = criarKnexScrum236Mock({ totalPreferencias: 1 });
    await expect(migrationScrum236.down(comPref.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem registros em preferencias_notificacao/
    );
  });

  it('executa DROP estrito (sem IF EXISTS) no down quando nÃƒÂ£o hÃƒÂ¡ dados operacionais', async () => {
    const limpo = criarKnexScrum236Mock({ totalPush: 0, totalPreferencias: 0 });
    await migrationScrum236.down(limpo.knexMock);

    const ddlDown = limpo.sqlExecutados.find((item) =>
      item.sql.includes('DROP TABLE push_subscriptions')
    );
    expect(ddlDown).toBeDefined();
    expect(ddlDown?.sql).not.toContain('IF EXISTS');
    expect(ddlDown?.sql).toContain('DROP TABLE preferencias_notificacao;');
    expect(ddlDown?.sql).toContain(
      'DROP TRIGGER trg_validar_regras_push_subscriptions ON push_subscriptions;'
    );
    expect(ddlDown?.sql).toContain('DROP FUNCTION validar_regras_push_subscriptions();');
  });

  it('rejeita role da aplicaÃƒÂ§ÃƒÂ£o que possua DELETE na tabela preferencias_notificacao', () => {
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
      podeDeletarNotificacoes: false,
      podeDeletarNotificacaoOutbox: false,
      podeDeletarPreferenciasNotificacao: true,
      privilegiosExcessivosTabelas: [] as string[],
    };

    expect(() => provisionarModule.validarEstadoMinimoPrivilegio(baseRole)).toThrow(
      /nao pode ter privilegio DELETE sobre a tabela preferencias_notificacao/
    );
  });
});
