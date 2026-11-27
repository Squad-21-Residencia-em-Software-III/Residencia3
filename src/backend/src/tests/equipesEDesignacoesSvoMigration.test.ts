import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const provisionarModule = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrationEquipesEDesignacoesSvo = require('../../database/migrations/20261118113000_scrum_198_equipes_integrantes_designacoes_svo.js') as {
  up: (knex: unknown) => Promise<void>;
  down: (knex: unknown) => Promise<void>;
  validarCatalogoScrum198: (knex: unknown) => Promise<void>;
};

describe('Contrato de banco, migration e privilégios de equipes e designações SVO', () => {
  function criarKnexEquipesEDesignacoesSvoMock(opcoes?: {
    nomesVazios?: number;
    nomesDuplicados?: { nome_norm: string; total: number }[];
    tipoVinculadoEm?: string;
    tipoDesignadoEm?: string;
    omitirConstraint?: string;
    omitirIndice?: string;
    totalDesignacoes?: number;
    totalVinculos?: number;
    totalIntegrantes?: number;
  }) {
    const sqlExecutados: string[] = [];

    const raw = vi.fn(async (sql: string) => {
      sqlExecutados.push(sql);

      if (sql.includes('current_schema()')) {
        return { rows: [{ schema_atual: 'public' }] };
      }

      if (sql.includes('length(btrim(nome_equipe)) = 0')) {
        return { rows: [{ total: opcoes?.nomesVazios ?? 0 }] };
      }

      if (sql.includes('GROUP BY lower(btrim(nome_equipe))')) {
        return { rows: opcoes?.nomesDuplicados ?? [] };
      }

      if (sql.includes('FROM pg_constraint')) {
        const todas = [
          {
            table_name: 'usuarios',
            conname: 'chk_usuarios_perfil',
            contype: 'c',
            def: "CHECK ((perfil IN ('ADMINISTRADOR', 'SOLICITANTE', 'GESTOR_FROTA', 'GESTOR_SVO', 'MOTORISTA_FROTA', 'MOTORISTA_SVO', 'INTEGRANTE_SVO')))",
          },
          {
            table_name: 'equipes_svo',
            conname: 'chk_equipes_svo_nome_nao_vazio',
            contype: 'c',
            def: 'CHECK ((length(btrim(nome_equipe)) > 0))',
          },
          {
            table_name: 'equipes_svo_integrantes',
            conname: 'fk_equipes_svo_integrantes_equipe',
            contype: 'f',
            def: 'FOREIGN KEY (equipe_id) REFERENCES equipes_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'equipes_svo_integrantes',
            conname: 'fk_equipes_svo_integrantes_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'equipes_svo_integrantes',
            conname: 'chk_equipes_svo_integrantes_periodo',
            contype: 'c',
            def: 'CHECK ((desvinculado_em IS NULL OR desvinculado_em >= vinculado_em))',
          },
          {
            table_name: 'ordens_svo_integrantes',
            conname: 'fk_ordens_svo_integrantes_ordem',
            contype: 'f',
            def: 'FOREIGN KEY (ordem_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'ordens_svo_integrantes',
            conname: 'fk_ordens_svo_integrantes_equipe',
            contype: 'f',
            def: 'FOREIGN KEY (equipe_id) REFERENCES equipes_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'ordens_svo_integrantes',
            conname: 'fk_ordens_svo_integrantes_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'ordens_svo_integrantes',
            conname: 'fk_ordens_svo_integrantes_designado_por',
            contype: 'f',
            def: 'FOREIGN KEY (designado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'ordens_svo_integrantes',
            conname: 'fk_ordens_svo_integrantes_revogado_por',
            contype: 'f',
            def: 'FOREIGN KEY (revogado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'ordens_svo_integrantes',
            conname: 'chk_ordens_svo_integrantes_revogacao',
            contype: 'c',
            def: 'CHECK (((revogado_em IS NULL AND revogado_por IS NULL) OR (revogado_em IS NOT NULL AND revogado_por IS NOT NULL AND revogado_em >= designado_em)))',
          },
        ];

        return {
          rows: todas.filter((c) => `${c.table_name}.${c.conname}` !== opcoes?.omitirConstraint),
        };
      }

      if (sql.includes("table_name = 'equipes_svo_integrantes'") && sql.includes('data_type')) {
        return {
          rows: [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'equipe_id', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'usuario_id', data_type: 'integer', is_nullable: 'NO' },
            {
              column_name: 'vinculado_em',
              data_type: opcoes?.tipoVinculadoEm ?? 'timestamp with time zone',
              is_nullable: 'NO',
            },
            { column_name: 'desvinculado_em', data_type: 'timestamp with time zone', is_nullable: 'YES' },
          ],
        };
      }

      if (sql.includes("table_name = 'ordens_svo_integrantes'") && sql.includes('data_type')) {
        return {
          rows: [
            { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'ordem_id', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'equipe_id', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'usuario_id', data_type: 'integer', is_nullable: 'NO' },
            {
              column_name: 'designado_em',
              data_type: opcoes?.tipoDesignadoEm ?? 'timestamp with time zone',
              is_nullable: 'NO',
            },
            { column_name: 'designado_por', data_type: 'integer', is_nullable: 'NO' },
            { column_name: 'revogado_em', data_type: 'timestamp with time zone', is_nullable: 'YES' },
            { column_name: 'revogado_por', data_type: 'integer', is_nullable: 'YES' },
          ],
        };
      }

      if (sql.includes('FROM pg_indexes')) {
        const todosIdx = [
          {
            indexname: 'uq_equipes_svo_nome_normalizado',
            indexdef:
              'CREATE UNIQUE INDEX uq_equipes_svo_nome_normalizado ON public.equipes_svo USING btree (lower(btrim((nome_equipe)::text)))',
          },
          {
            indexname: 'uq_equipes_svo_integrantes_ativo',
            indexdef:
              'CREATE UNIQUE INDEX uq_equipes_svo_integrantes_ativo ON public.equipes_svo_integrantes USING btree (equipe_id, usuario_id) WHERE (desvinculado_em IS NULL)',
          },
          {
            indexname: 'idx_equipes_svo_integrantes_usuario_ativo',
            indexdef:
              'CREATE INDEX idx_equipes_svo_integrantes_usuario_ativo ON public.equipes_svo_integrantes USING btree (usuario_id, equipe_id) WHERE (desvinculado_em IS NULL)',
          },
          {
            indexname: 'idx_equipes_svo_integrantes_equipe',
            indexdef:
              'CREATE INDEX idx_equipes_svo_integrantes_equipe ON public.equipes_svo_integrantes USING btree (equipe_id)',
          },
          {
            indexname: 'uq_ordens_svo_integrantes_ativo',
            indexdef:
              'CREATE UNIQUE INDEX uq_ordens_svo_integrantes_ativo ON public.ordens_svo_integrantes USING btree (ordem_id, usuario_id) WHERE (revogado_em IS NULL)',
          },
          {
            indexname: 'idx_ordens_svo_integrantes_usuario_ativo',
            indexdef:
              'CREATE INDEX idx_ordens_svo_integrantes_usuario_ativo ON public.ordens_svo_integrantes USING btree (usuario_id, ordem_id) WHERE (revogado_em IS NULL)',
          },
          {
            indexname: 'idx_ordens_svo_integrantes_equipe_usuario_ativo',
            indexdef:
              'CREATE INDEX idx_ordens_svo_integrantes_equipe_usuario_ativo ON public.ordens_svo_integrantes USING btree (equipe_id, usuario_id, ordem_id) WHERE (revogado_em IS NULL)',
          },
          {
            indexname: 'idx_ordens_svo_integrantes_ordem',
            indexdef:
              'CREATE INDEX idx_ordens_svo_integrantes_ordem ON public.ordens_svo_integrantes USING btree (ordem_id)',
          },
        ];

        return {
          rows: todosIdx.filter((i) => i.indexname !== opcoes?.omitirIndice),
        };
      }

      return { rows: [] };
    });

    const knexMock: any = (tabela: string) => ({
      whereNotIn: () => ({
        count: async () => [{ total: '0' }],
      }),
      where: () => ({
        first: async () => undefined,
        count: () => ({
          first: async () => ({
            total: String(tabela === 'usuarios' ? (opcoes?.totalIntegrantes ?? 0) : 0),
          }),
        }),
      }),
      count: () => ({
        first: async () => ({
          total: String(
            tabela === 'ordens_svo_integrantes'
              ? (opcoes?.totalDesignacoes ?? 0)
              : tabela === 'equipes_svo_integrantes'
                ? (opcoes?.totalVinculos ?? 0)
                : 0
          ),
        }),
      }),
    });
    knexMock.raw = raw;

    return { knexMock, sqlExecutados };
  }

  it('bloqueia up quando existem equipes com nome vazio ou duplicado após normalização', async () => {
    const comVazio = criarKnexEquipesEDesignacoesSvoMock({ nomesVazios: 1 });
    await expect(migrationEquipesEDesignacoesSvo.up(comVazio.knexMock)).rejects.toThrow(
      /existem registros em equipes_svo com nome_equipe vazio/
    );

    const comDuplicado = criarKnexEquipesEDesignacoesSvoMock({
      nomesDuplicados: [{ nome_norm: 'equipe alfa', total: 2 }],
    });
    await expect(migrationEquipesEDesignacoesSvo.up(comDuplicado.knexMock)).rejects.toThrow(
      /existem nomes de equipe duplicados apos normalizacao/
    );
  });

  it('rejeita estruturas preexistentes incompatíveis em validarCatalogoScrum198', async () => {
    const tipoInvalido = criarKnexEquipesEDesignacoesSvoMock({ tipoVinculadoEm: 'text' });
    await expect(migrationEquipesEDesignacoesSvo.validarCatalogoScrum198(tipoInvalido.knexMock)).rejects.toThrow(
      /Estrutura incompativel em equipes_svo_integrantes\.vinculado_em/
    );

    const semConstraint = criarKnexEquipesEDesignacoesSvoMock({
      omitirConstraint: 'ordens_svo_integrantes.chk_ordens_svo_integrantes_revogacao',
    });
    await expect(migrationEquipesEDesignacoesSvo.validarCatalogoScrum198(semConstraint.knexMock)).rejects.toThrow(
      /Constraint obrigatoria ausente ou incompativel: ordens_svo_integrantes\.chk_ordens_svo_integrantes_revogacao/
    );

    const semIndice = criarKnexEquipesEDesignacoesSvoMock({
      omitirIndice: 'uq_ordens_svo_integrantes_ativo',
    });
    await expect(migrationEquipesEDesignacoesSvo.validarCatalogoScrum198(semIndice.knexMock)).rejects.toThrow(
      /Indice obrigatorio ausente ou incompativel: uq_ordens_svo_integrantes_ativo/
    );
  });

  it('bloqueia rollback (down) quando há designações, vínculos ou usuários INTEGRANTE_SVO', async () => {
    const comDesignacoes = criarKnexEquipesEDesignacoesSvoMock({ totalDesignacoes: 2 });
    await expect(migrationEquipesEDesignacoesSvo.down(comDesignacoes.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem designacoes registradas em ordens_svo_integrantes/
    );

    const comVinculos = criarKnexEquipesEDesignacoesSvoMock({ totalVinculos: 1 });
    await expect(migrationEquipesEDesignacoesSvo.down(comVinculos.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem vinculos registrados em equipes_svo_integrantes/
    );

    const comIntegrantes = criarKnexEquipesEDesignacoesSvoMock({ totalIntegrantes: 1 });
    await expect(migrationEquipesEDesignacoesSvo.down(comIntegrantes.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem usuarios com perfil INTEGRANTE_SVO/
    );
  });

  it('executa DROP estrito (sem IF EXISTS) no down quando não há dados operacionais', async () => {
    const limpo = criarKnexEquipesEDesignacoesSvoMock();
    await migrationEquipesEDesignacoesSvo.down(limpo.knexMock);

    const ddlDown = limpo.sqlExecutados.find((sql) => sql.includes('DROP TABLE ordens_svo_integrantes'));
    expect(ddlDown).toBeDefined();
    expect(ddlDown).not.toContain('IF EXISTS');
    expect(ddlDown).toContain('DROP INDEX idx_ordens_svo_integrantes_ordem;');
    expect(ddlDown).toContain('DROP INDEX uq_equipes_svo_nome_normalizado;');
  });

  it('rejeita role da aplicação que possua DELETE nas tabelas históricas de vínculos e designações SVO', () => {
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
      podeDeletarHistoricoSvo: true,
      privilegiosExcessivosTabelas: [] as string[],
    };

    expect(() => provisionarModule.validarEstadoMinimoPrivilegio(baseRole)).toThrow(
      /nao pode ter privilegio DELETE sobre tabelas de historico/
    );
  });
});
