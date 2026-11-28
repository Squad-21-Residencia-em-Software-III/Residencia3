import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const provisionarModule = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>) => boolean;
  obterTemplateSqlRole: (ctx: { roleExistente: boolean; executorEhSuperuser: boolean }) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrationAlertasSvoEMaterialSensivel = require('../../database/migrations/20261117172500_scrum_183_fila_alertas_svo_e_material_sensivel.js') as {
  up: (knex: unknown) => Promise<void>;
  down: (knex: unknown) => Promise<void>;
  validarCatalogoScrum183: (knex: unknown) => Promise<boolean>;
};

describe('Segurança da role da aplicação e da migration de alertas SVO e material sensível', () => {
  const estadoSeguroBase = {
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
    privilegiosExcessivosTabelas: [] as string[],
  };

  describe('Validação de mínimo privilégio da role (provisionar-usuario-app)', () => {
    it('aprova role restrita sem superuser, replication, bypassrls, herança nem DDL', () => {
      expect(provisionarModule.validarEstadoMinimoPrivilegio(estadoSeguroBase)).toBe(true);
    });

    it('rejeita role que mantenha rolsuper, rolreplication, rolbypassrls ou rolinherit ativos', () => {
      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({ ...estadoSeguroBase, rolsuper: true })
      ).toThrow(/NOSUPERUSER/);

      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({
          ...estadoSeguroBase,
          rolreplication: true,
        })
      ).toThrow(/NOREPLICATION/);

      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({
          ...estadoSeguroBase,
          rolbypassrls: true,
        })
      ).toThrow(/NOBYPASSRLS/);

      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({ ...estadoSeguroBase, rolinherit: true })
      ).toThrow(/NOINHERIT/);
    });

    it('rejeita role com associações herdadas, CREATE no public, acesso a knex_migrations ou TRUNCATE', () => {
      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({
          ...estadoSeguroBase,
          rolesHerdadas: ['pg_write_all_data'],
        })
      ).toThrow(/associacoes herdadas indevidas/);

      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({
          ...estadoSeguroBase,
          podeCriarNoPublic: true,
        })
      ).toThrow(/privilegio CREATE no schema public/);

      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({
          ...estadoSeguroBase,
          podeAcessarMigrations: true,
        })
      ).toThrow(/knex_migrations/);

      expect(() =>
        provisionarModule.validarEstadoMinimoPrivilegio({
          ...estadoSeguroBase,
          privilegiosExcessivosTabelas: ['usuarios:TRUNCATE'],
        })
      ).toThrow(/usuarios:TRUNCATE/);
    });

    it('inclui NOSUPERUSER, NOREPLICATION, NOBYPASSRLS e NOINHERIT no CREATE ROLE e no ALTER ROLE como superuser', () => {
      const sqlCreate = provisionarModule.obterTemplateSqlRole({
        roleExistente: false,
        executorEhSuperuser: false,
      });
      expect(sqlCreate).toContain('NOSUPERUSER');
      expect(sqlCreate).toContain('NOREPLICATION');
      expect(sqlCreate).toContain('NOBYPASSRLS');
      expect(sqlCreate).toContain('NOINHERIT');

      const sqlAlterSuper = provisionarModule.obterTemplateSqlRole({
        roleExistente: true,
        executorEhSuperuser: true,
      });
      expect(sqlAlterSuper).toContain('NOSUPERUSER');
      expect(sqlAlterSuper).toContain('NOREPLICATION');
      expect(sqlAlterSuper).toContain('NOBYPASSRLS');
      expect(sqlAlterSuper).toContain('NOINHERIT');

      const sqlAlterGerenciado = provisionarModule.obterTemplateSqlRole({
        roleExistente: true,
        executorEhSuperuser: false,
      });
      expect(sqlAlterGerenciado).toContain('NOCREATEDB NOCREATEROLE NOINHERIT');
    });
  });

  describe('Validação de catálogo e bloqueio de rollback destrutivo na migration de alertas SVO e material sensível', () => {
    function criarKnexCatalogoValido(sobrescritas?: {
      tipoLiberadaEm?: string;
      alertaExistente?: { id: number };
      ordemLiberada?: { id: number };
      solicitacaoSensivel?: { id: number };
    }) {
      const sqlExecutados: string[] = [];
      const raw = vi.fn(async (sql: string) => {
        sqlExecutados.push(sql);
        if (sql.includes('current_schema()')) {
          return { rows: [{ schema_atual: 'public' }] };
        }
        if (sql.includes("table_name = 'ordens_svo'") && sql.includes('data_type')) {
          return {
            rows: [
              { column_name: 'inicio_previsto', data_type: 'timestamp with time zone', is_nullable: 'YES' },
              { column_name: 'fim_previsto', data_type: 'timestamp with time zone', is_nullable: 'YES' },
              {
                column_name: 'liberada_em',
                data_type: sobrescritas?.tipoLiberadaEm ?? 'timestamp with time zone',
                is_nullable: 'YES',
              },
            ],
          };
        }
        if (sql.includes("table_name = 'solicitacoes_viagem'") && sql.includes('data_type')) {
          return {
            rows: [
              {
                column_name: 'material_sensivel',
                data_type: 'boolean',
                is_nullable: 'NO',
                column_default: 'false',
              },
            ],
          };
        }
        if (sql.includes("table_name = 'alertas_atraso_svo'") && sql.includes('is_identity')) {
          return {
            rows: [
              { column_name: 'id', data_type: 'integer', is_nullable: 'NO', is_identity: 'YES' },
              { column_name: 'ordem_em_atraso_id', data_type: 'integer', is_nullable: 'NO', is_identity: 'NO' },
              { column_name: 'ordem_afetada_id', data_type: 'integer', is_nullable: 'NO', is_identity: 'NO' },
              { column_name: 'criado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', is_identity: 'NO' },
              { column_name: 'resolvido_em', data_type: 'timestamp with time zone', is_nullable: 'YES', is_identity: 'NO' },
            ],
          };
        }
        if (sql.includes('FROM pg_constraint')) {
          return {
            rows: [
              { conname: 'alertas_atraso_svo_pkey', contype: 'p', def: 'PRIMARY KEY (id)' },
              {
                conname: 'fk_alertas_atraso_svo_atrasada',
                contype: 'f',
                def: 'FOREIGN KEY (ordem_em_atraso_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT',
              },
              {
                conname: 'fk_alertas_atraso_svo_afetada',
                contype: 'f',
                def: 'FOREIGN KEY (ordem_afetada_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT',
              },
              {
                conname: 'uq_alertas_atraso_svo_ordens',
                contype: 'u',
                def: 'UNIQUE (ordem_em_atraso_id, ordem_afetada_id)',
              },
              {
                conname: 'chk_alertas_atraso_svo_ordens_distintas',
                contype: 'c',
                def: 'CHECK ((ordem_em_atraso_id <> ordem_afetada_id))',
              },
            ],
          };
        }
        if (sql.includes('FROM pg_indexes')) {
          return {
            rows: [
              {
                indexname: 'idx_alertas_atraso_svo_abertos',
                indexdef:
                  'CREATE INDEX idx_alertas_atraso_svo_abertos ON public.alertas_atraso_svo USING btree (ordem_afetada_id) WHERE (resolvido_em IS NULL)',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const knexMock: any = (tabela: string) => ({
        first: async () => (tabela === 'alertas_atraso_svo' ? sobrescritas?.alertaExistente : undefined),
        whereNotNull: () => ({
          first: async () => (tabela === 'ordens_svo' ? sobrescritas?.ordemLiberada : undefined),
        }),
        where: () => ({
          first: async () =>
            tabela === 'solicitacoes_viagem' ? sobrescritas?.solicitacaoSensivel : undefined,
        }),
      });
      knexMock.raw = raw;

      return { knexMock, sqlExecutados };
    }

    it('rejeita estrutura preexistente incompatível em validarCatalogoScrum183', async () => {
      const { knexMock } = criarKnexCatalogoValido({ tipoLiberadaEm: 'text' });

      await expect(migrationAlertasSvoEMaterialSensivel.validarCatalogoScrum183(knexMock)).rejects.toThrow(
        /Estrutura incompativel em public\.ordens_svo\.liberada_em/
      );
    });

    it('bloqueia down quando há alertas, ordens liberadas ou solicitações com material sensível', async () => {
      const comAlerta = criarKnexCatalogoValido({ alertaExistente: { id: 10 } });
      await expect(migrationAlertasSvoEMaterialSensivel.down(comAlerta.knexMock)).rejects.toThrow(
        /Rollback bloqueado: existem registros em alertas_atraso_svo/
      );

      const comOrdemLiberada = criarKnexCatalogoValido({ ordemLiberada: { id: 3 } });
      await expect(migrationAlertasSvoEMaterialSensivel.down(comOrdemLiberada.knexMock)).rejects.toThrow(
        /Rollback bloqueado: existem ordens em ordens_svo com liberada_em preenchido/
      );

      const comMaterialSensivel = criarKnexCatalogoValido({ solicitacaoSensivel: { id: 8 } });
      await expect(migrationAlertasSvoEMaterialSensivel.down(comMaterialSensivel.knexMock)).rejects.toThrow(
        /Rollback bloqueado: existem solicitacoes em solicitacoes_viagem com material_sensivel = true/
      );
    });

    it('executa DROP estrito (sem IF EXISTS) no down quando não há dados operacionais', async () => {
      const { knexMock, sqlExecutados } = criarKnexCatalogoValido();

      await migrationAlertasSvoEMaterialSensivel.down(knexMock);

      expect(sqlExecutados).toContain('DROP INDEX idx_alertas_atraso_svo_abertos');
      expect(sqlExecutados).toContain('DROP TABLE alertas_atraso_svo');
      expect(sqlExecutados).toContain('ALTER TABLE ordens_svo DROP COLUMN liberada_em');
      expect(sqlExecutados).toContain('ALTER TABLE solicitacoes_viagem DROP COLUMN material_sensivel');
    });
  });
});
