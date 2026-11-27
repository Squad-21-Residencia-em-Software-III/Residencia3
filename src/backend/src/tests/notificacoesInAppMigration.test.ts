import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const provisionarModule = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrationNotificacoesInApp = require('../../database/migrations/20261124193000_scrum_225_notificacoes_in_app.js') as {
  up: (knex: unknown) => Promise<void>;
  down: (knex: unknown) => Promise<void>;
  validarCatalogoScrum225: (knex: unknown) => Promise<void>;
};

describe('Contrato de banco, migration e privilégios de notificações In-App (notificações In-App)', () => {
  function criarKnexNotificacoesInAppMock(opcoes?: {
    schemaAtual?: string;
    tabelasBaseCount?: number;
    tabelaNotificacoesPreexistente?: boolean;
    tipoCriadoEm?: string;
    tamanhoMensagem?: number;
    omitirConstraint?: string;
    omitirIndice?: string;
    totalNotificacoes?: number;
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
        sql.includes("table_name = 'notificacoes'")
      ) {
        return {
          rows: opcoes?.tabelaNotificacoesPreexistente ? [{ '?column?': 1 }] : [],
        };
      }

      if (sql.includes('FROM information_schema.columns') && sql.includes("table_name = 'notificacoes'")) {
        return {
          rows: [
            {
              column_name: 'id',
              data_type: 'integer',
              is_nullable: 'NO',
              character_maximum_length: null,
            },
            {
              column_name: 'usuario_id',
              data_type: 'integer',
              is_nullable: 'NO',
              character_maximum_length: null,
            },
            {
              column_name: 'tipo',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: 64,
            },
            {
              column_name: 'titulo',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: 120,
            },
            {
              column_name: 'mensagem',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: opcoes?.tamanhoMensagem ?? 280,
            },
            {
              column_name: 'severidade',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: 20,
            },
            {
              column_name: 'operacao',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: 20,
            },
            {
              column_name: 'referencia_tipo',
              data_type: 'character varying',
              is_nullable: 'YES',
              character_maximum_length: 40,
            },
            {
              column_name: 'referencia_id',
              data_type: 'integer',
              is_nullable: 'YES',
              character_maximum_length: null,
            },
            {
              column_name: 'url_destino',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: 255,
            },
            {
              column_name: 'chave_idempotencia',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: 190,
            },
            {
              column_name: 'lida_em',
              data_type: 'timestamp with time zone',
              is_nullable: 'YES',
              character_maximum_length: null,
            },
            {
              column_name: 'criado_em',
              data_type: opcoes?.tipoCriadoEm ?? 'timestamp with time zone',
              is_nullable: 'NO',
              character_maximum_length: null,
            },
          ],
        };
      }

      if (sql.includes('FROM pg_constraint')) {
        const todas = [
          {
            table_name: 'notificacoes',
            conname: 'fk_notificacoes_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE',
          },
          {
            table_name: 'notificacoes',
            conname: 'uq_notificacoes_usuario_chave_idempotencia',
            contype: 'u',
            def: 'UNIQUE (usuario_id, chave_idempotencia)',
          },
          {
            table_name: 'notificacoes',
            conname: 'chk_notificacoes_campos_obrigatorios',
            contype: 'c',
            def: 'CHECK (((length(btrim((tipo)::text)) > 0) AND (length(btrim((titulo)::text)) > 0) AND (length(btrim((mensagem)::text)) > 0) AND (char_length((mensagem)::text) <= 280) AND (length(btrim((chave_idempotencia)::text)) > 0)))',
          },
          {
            table_name: 'notificacoes',
            conname: 'chk_notificacoes_severidade',
            contype: 'c',
            def: "CHECK (((severidade)::text = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'danger'::text])))",
          },
          {
            table_name: 'notificacoes',
            conname: 'chk_notificacoes_operacao',
            contype: 'c',
            def: "CHECK (((operacao)::text = ANY (ARRAY['Administrativo'::text, 'SVO'::text])))",
          },
          {
            table_name: 'notificacoes',
            conname: 'chk_notificacoes_referencia_coerente',
            contype: 'c',
            def: 'CHECK (((referencia_tipo IS NULL AND referencia_id IS NULL) OR (referencia_tipo IS NOT NULL AND length(btrim((referencia_tipo)::text)) > 0 AND referencia_id IS NOT NULL AND referencia_id > 0)))',
          },
          {
            table_name: 'notificacoes',
            conname: 'chk_notificacoes_url_destino_interna',
            contype: 'c',
            def: "CHECK (((length(btrim((url_destino)::text)) > 0) AND ((url_destino)::text = btrim((url_destino)::text)) AND ((url_destino)::text ~~ '/%'::text) AND ((url_destino)::text !~~ '//%'::text) AND ((url_destino)::text !~ '[\\\\[:space:][:cntrl:]]'::text) AND ((url_destino)::text !~* '^[a-z][a-z0-9+.-]*:'::text)))",
          },
          {
            table_name: 'notificacoes',
            conname: 'chk_notificacoes_leitura_temporal',
            contype: 'c',
            def: 'CHECK ((lida_em IS NULL OR lida_em >= criado_em))',
          },
        ];

        return {
          rows: todas.filter((c) => `${c.table_name}.${c.conname}` !== opcoes?.omitirConstraint),
        };
      }

      if (sql.includes('FROM pg_indexes')) {
        const todosIdx = [
          {
            indexname: 'idx_notificacoes_usuario_cursor',
            indexdef:
              'CREATE INDEX idx_notificacoes_usuario_cursor ON public.notificacoes USING btree (usuario_id, criado_em DESC, id DESC)',
          },
          {
            indexname: 'idx_notificacoes_usuario_lida_criado',
            indexdef:
              'CREATE INDEX idx_notificacoes_usuario_lida_criado ON public.notificacoes USING btree (usuario_id, lida_em, criado_em DESC, id DESC)',
          },
          {
            indexname: 'idx_notificacoes_usuario_nao_lidas',
            indexdef:
              'CREATE INDEX idx_notificacoes_usuario_nao_lidas ON public.notificacoes USING btree (usuario_id, criado_em DESC, id DESC) WHERE (lida_em IS NULL)',
          },
          {
            indexname: 'idx_notificacoes_usuario_referencia',
            indexdef:
              'CREATE INDEX idx_notificacoes_usuario_referencia ON public.notificacoes USING btree (usuario_id, referencia_tipo, referencia_id)',
          },
          {
            indexname: 'idx_notificacoes_retencao_lidas',
            indexdef:
              'CREATE INDEX idx_notificacoes_retencao_lidas ON public.notificacoes USING btree (lida_em) WHERE (lida_em IS NOT NULL)',
          },
          {
            indexname: 'idx_notificacoes_criado_em',
            indexdef:
              'CREATE INDEX idx_notificacoes_criado_em ON public.notificacoes USING btree (criado_em)',
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
          total: String(tabela === 'notificacoes' ? (opcoes?.totalNotificacoes ?? 0) : 0),
        }),
      }),
    });
    knexMock.raw = raw;

    return { knexMock, sqlExecutados };
  }

  it('não utiliza IF EXISTS nem IF NOT EXISTS cegos no código-fonte da migration de notificações In-App', () => {
    const caminhoMigration = path.resolve(
      __dirname,
      '../../database/migrations/20261124193000_scrum_225_notificacoes_in_app.js'
    );
    const codigoFonte = fs.readFileSync(caminhoMigration, 'utf-8');

    expect(codigoFonte).not.toMatch(/\bIF\s+EXISTS\b/i);
    expect(codigoFonte).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
  });

  it('define contrato fiel à Seção 6.1 do Plano (ON DELETE CASCADE, VARCHAR(280) em mensagem, severidade e operação)', async () => {
    const { knexMock, sqlExecutados } = criarKnexNotificacoesInAppMock();
    await migrationNotificacoesInApp.up(knexMock);

    const ddlCreate = sqlExecutados.find((item) => item.sql.includes('CREATE TABLE notificacoes'));
    expect(ddlCreate).toBeDefined();
    expect(ddlCreate?.sql).toContain('REFERENCES usuarios(id) ON DELETE CASCADE');
    expect(ddlCreate?.sql).toContain('tipo VARCHAR(64) NOT NULL');
    expect(ddlCreate?.sql).toContain('titulo VARCHAR(120) NOT NULL');
    expect(ddlCreate?.sql).toContain('mensagem VARCHAR(280) NOT NULL');
    expect(ddlCreate?.sql).toContain("CHECK (severidade IN ('info', 'success', 'warning', 'danger'))");
    expect(ddlCreate?.sql).toContain("CHECK (operacao IN ('Administrativo', 'SVO'))");
    expect(ddlCreate?.sql).toContain("url_destino !~ '[\\\\[:space:][:cntrl:]]'");
  });

  it('bloqueia up quando a tabela base usuarios não está presente no schema alvo', async () => {
    const semBase = criarKnexNotificacoesInAppMock({ tabelasBaseCount: 0 });
    await expect(migrationNotificacoesInApp.up(semBase.knexMock)).rejects.toThrow(
      /tabela base usuarios ausente no schema alvo/
    );
  });

  it('rejeita estruturas preexistentes incompatíveis em validarCatalogoScrum225 (tipo, limite de tamanho, constraint e índice)', async () => {
    const tipoInvalido = criarKnexNotificacoesInAppMock({ tipoCriadoEm: 'text' });
    await expect(migrationNotificacoesInApp.validarCatalogoScrum225(tipoInvalido.knexMock)).rejects.toThrow(
      /Estrutura incompativel em notificacoes\.criado_em/
    );

    const tamanhoMensagemInvalido = criarKnexNotificacoesInAppMock({ tamanhoMensagem: 500 });
    await expect(
      migrationNotificacoesInApp.validarCatalogoScrum225(tamanhoMensagemInvalido.knexMock)
    ).rejects.toThrow(/Estrutura incompativel em notificacoes\.mensagem/);

    const semConstraint = criarKnexNotificacoesInAppMock({
      omitirConstraint: 'notificacoes.uq_notificacoes_usuario_chave_idempotencia',
    });
    await expect(
      migrationNotificacoesInApp.validarCatalogoScrum225(semConstraint.knexMock)
    ).rejects.toThrow(
      /Constraint obrigatoria ausente ou incompativel: notificacoes\.uq_notificacoes_usuario_chave_idempotencia/
    );

    const semIndice = criarKnexNotificacoesInAppMock({
      omitirIndice: 'idx_notificacoes_usuario_cursor',
    });
    await expect(migrationNotificacoesInApp.validarCatalogoScrum225(semIndice.knexMock)).rejects.toThrow(
      /Indice obrigatorio ausente ou incompativel: idx_notificacoes_usuario_cursor/
    );
  });

  it('interpola o schema atual (current_schema) nos comandos REVOKE e GRANT da role da aplicação', async () => {
    const appUserAnterior = process.env.POSTGRES_APP_USER;
    process.env.POSTGRES_APP_USER = 'frotas_app';
    try {
      const { knexMock, sqlExecutados } = criarKnexNotificacoesInAppMock({
        schemaAtual: 'schema_isolado_225',
        roleAppPresente: true,
      });

      await migrationNotificacoesInApp.up(knexMock);

      const cmdRevoke = sqlExecutados.find((item) =>
        item.sql.includes('REVOKE ALL PRIVILEGES ON TABLE ??.notificacoes FROM ??')
      );
      expect(cmdRevoke).toBeDefined();
      expect(cmdRevoke?.bindings).toEqual(['schema_isolado_225', 'frotas_app']);

      const cmdGrant = sqlExecutados.find((item) =>
        item.sql.includes('GRANT SELECT, INSERT, UPDATE ON TABLE ??.notificacoes TO ??')
      );
      expect(cmdGrant).toBeDefined();
      expect(cmdGrant?.bindings).toEqual(['schema_isolado_225', 'frotas_app']);
    } finally {
      if (appUserAnterior === undefined) {
        delete process.env.POSTGRES_APP_USER;
      } else {
        process.env.POSTGRES_APP_USER = appUserAnterior;
      }
    }
  });

  it('bloqueia rollback (down) quando há notificações persistidas em notificacoes', async () => {
    const comDados = criarKnexNotificacoesInAppMock({ totalNotificacoes: 3 });
    await expect(migrationNotificacoesInApp.down(comDados.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem registros em notificacoes/
    );
  });

  it('executa DROP estrito (sem IF EXISTS) no down quando não há dados operacionais', async () => {
    const limpo = criarKnexNotificacoesInAppMock({ totalNotificacoes: 0 });
    await migrationNotificacoesInApp.down(limpo.knexMock);

    const ddlDown = limpo.sqlExecutados.find((item) =>
      item.sql.includes('DROP TABLE notificacoes')
    );
    expect(ddlDown).toBeDefined();
    expect(ddlDown?.sql).not.toContain('IF EXISTS');
    expect(ddlDown?.sql).toContain('DROP INDEX idx_notificacoes_usuario_cursor;');
    expect(ddlDown?.sql).toContain('DROP INDEX idx_notificacoes_usuario_lida_criado;');
    expect(ddlDown?.sql).toContain('DROP INDEX idx_notificacoes_retencao_lidas;');
    expect(ddlDown?.sql).toContain('DROP INDEX idx_notificacoes_criado_em;');
  });

  it('rejeita role da aplicação que possua DELETE na tabela notificacoes', () => {
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
      podeDeletarNotificacoes: true,
      privilegiosExcessivosTabelas: [] as string[],
    };

    expect(() => provisionarModule.validarEstadoMinimoPrivilegio(baseRole)).toThrow(
      /nao pode ter privilegio DELETE sobre a tabela notificacoes/
    );
  });
});
