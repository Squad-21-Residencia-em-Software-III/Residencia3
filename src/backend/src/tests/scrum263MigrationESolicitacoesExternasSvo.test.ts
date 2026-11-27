import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const provisionarModule = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrationScrum263 = require('../../database/migrations/20261127130000_scrum_263_solicitacoes_externas_svo.js') as {
  up: (knex: unknown) => Promise<void>;
  down: (knex: unknown) => Promise<void>;
  validarCatalogoScrum263: (knex: unknown) => Promise<void>;
};

describe('Contrato de banco, migration e privilégios da SCRUM-263 (solicitações externas SVO, canal e dados protegidos)', () => {
  function criarKnexScrum263Mock(opcoes?: {
    schemaAtual?: string;
    tabelasBaseCount?: number;
    nullableRegistranteId?: string;
    tamanhoProtocolo?: number;
    tipoCpfSolicitante?: string;
    omitirConstraint?: string;
    omitirIndice?: string;
    omitirTrigger?: string;
    totalDadosExternos?: number;
    totalCredenciaisExternas?: number;
    totalSolicitacoesExternas?: number;
    roleAppPresente?: boolean;
  }) {
    const sqlExecutados: { sql: string; bindings?: unknown[] }[] = [];

    const raw = vi.fn(async (sql: string, bindings?: unknown[]) => {
      sqlExecutados.push({ sql, bindings });

      if (sql.includes('current_schema()')) {
        return { rows: [{ schema_atual: opcoes?.schemaAtual ?? 'public' }] };
      }

      if (
        sql.includes('FROM information_schema.tables') &&
        sql.includes("table_name IN ('usuarios', 'solicitacoes_svo')")
      ) {
        const qtd = opcoes?.tabelasBaseCount ?? 2;
        return {
          rows: Array.from({ length: qtd }, (_, idx) => ({
            table_name: idx === 0 ? 'usuarios' : 'solicitacoes_svo',
          })),
        };
      }

      if (
        sql.includes('FROM information_schema.columns') &&
        sql.includes("column_name IN ('canal_origem', 'protocolo')")
      ) {
        return { rows: [] };
      }

      if (
        sql.includes('FROM information_schema.tables') &&
        (sql.includes("table_name = 'solicitacoes_svo_dados_externos'") ||
          sql.includes("table_name = 'solicitacoes_svo_credenciais_externas'"))
      ) {
        return { rows: [] };
      }

      if (sql.includes('FROM information_schema.columns') && bindings?.[1] === 'solicitacoes_svo') {
        return {
          rows: [
            {
              column_name: 'registrante_id',
              data_type: 'integer',
              is_nullable: opcoes?.nullableRegistranteId ?? 'YES',
              character_maximum_length: null,
            },
            {
              column_name: 'canal_origem',
              data_type: 'character varying',
              is_nullable: 'NO',
              character_maximum_length: 20,
            },
            {
              column_name: 'protocolo',
              data_type: 'character varying',
              is_nullable: 'YES',
              character_maximum_length: opcoes?.tamanhoProtocolo ?? 64,
            },
          ],
        };
      }

      if (
        sql.includes('FROM information_schema.columns') &&
        bindings?.[1] === 'solicitacoes_svo_dados_externos'
      ) {
        return {
          rows: [
            { column_name: 'solicitacao_id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'nome_solicitante', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 150 },
            { column_name: 'telefone_solicitante', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 30 },
            { column_name: 'email_solicitante', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 255 },
            {
              column_name: 'cpf_solicitante',
              data_type: opcoes?.tipoCpfSolicitante ?? 'character',
              is_nullable: 'YES',
              character_maximum_length: 11,
            },
            { column_name: 'tipo_solicitante', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 20 },
            { column_name: 'nome_instituicao', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 180 },
            { column_name: 'nome_falecido', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 150 },
            { column_name: 'documento_falecido', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 60 },
            { column_name: 'endereco_ocorrencia', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 255 },
            { column_name: 'numero_imovel', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 30 },
            { column_name: 'sem_numero_imovel', data_type: 'boolean', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'complemento_ocorrencia', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 120 },
            { column_name: 'ponto_referencia', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 255 },
            { column_name: 'latitude_ocorrencia', data_type: 'double precision', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'longitude_ocorrencia', data_type: 'double precision', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'fora_area_cobertura', data_type: 'boolean', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'descricao_ocorrencia', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 2000 },
            { column_name: 'data_hora_ocorrencia', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'informacoes_medicas', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 2000 },
            { column_name: 'ciencia_aviso_privacidade', data_type: 'boolean', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'versao_aviso_privacidade', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 40 },
            { column_name: 'ciencia_registrada_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'motivo_recusa_publico', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 500 },
            { column_name: 'cancelamento_solicitado_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'cancelamento_motivo', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 500 },
            { column_name: 'cancelamento_status', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 20 },
            { column_name: 'cancelamento_decidido_por', data_type: 'integer', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'cancelamento_decidido_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'cancelamento_justificativa_decisao', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 500 },
            { column_name: 'versao_dados', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'encerrado_operacional_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'consulta_publica_expira_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'retencao_ate', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'preservacao_legal', data_type: 'boolean', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'preservacao_motivo', data_type: 'text', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'anonimizado_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'expurgado_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'expurgado_por', data_type: 'integer', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'expurgo_motivo', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 100 },
            { column_name: 'criado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'atualizado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
          ],
        };
      }

      if (
        sql.includes('FROM information_schema.columns') &&
        bindings?.[1] === 'solicitacoes_svo_credenciais_externas'
      ) {
        return {
          rows: [
            { column_name: 'solicitacao_id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'segredo_digest', data_type: 'character', is_nullable: 'NO', character_maximum_length: 64 },
            { column_name: 'algoritmo_digest', data_type: 'character varying', is_nullable: 'NO', character_maximum_length: 30 },
            { column_name: 'versao_credencial', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'chave_idempotencia_criacao', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 120 },
            { column_name: 'payload_criacao_digest', data_type: 'character', is_nullable: 'YES', character_maximum_length: 64 },
            { column_name: 'prova_tentativa_digest', data_type: 'character', is_nullable: 'YES', character_maximum_length: 64 },
            { column_name: 'envelope_recuperacao', data_type: 'text', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'recuperacao_expira_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'emitida_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
            { column_name: 'valida_ate', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'revogada_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'revogada_motivo', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 120 },
            { column_name: 'ultimo_acesso_em', data_type: 'timestamp with time zone', is_nullable: 'YES', character_maximum_length: null },
            { column_name: 'atualizado_em', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null },
          ],
        };
      }

      if (sql.includes('FROM pg_constraint')) {
        const todas = [
          {
            table_name: 'solicitacoes_svo',
            conname: 'solicitacoes_svo_registrante_id_foreign',
            contype: 'f',
            def: 'FOREIGN KEY (registrante_id) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'solicitacoes_svo',
            conname: 'chk_solicitacoes_svo_canal_origem',
            contype: 'c',
            def: "CHECK (canal_origem IN ('INTERNA', 'EXTERNA'))",
          },
          {
            table_name: 'solicitacoes_svo',
            conname: 'chk_solicitacoes_svo_canal_registrante_protocolo',
            contype: 'c',
            def: 'CHECK ((canal_origem = INTERNA AND registrante_id IS NOT NULL) OR (canal_origem = EXTERNA AND registrante_id IS NULL))',
          },
          {
            table_name: 'solicitacoes_svo',
            conname: 'uq_solicitacoes_svo_protocolo',
            contype: 'u',
            def: 'UNIQUE (protocolo)',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'fk_solicitacoes_svo_dados_externos_solicitacao',
            contype: 'f',
            def: 'FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'fk_solicitacoes_svo_dados_externos_cancelamento_decisor',
            contype: 'f',
            def: 'FOREIGN KEY (cancelamento_decidido_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'fk_solicitacoes_svo_dados_externos_expurgado_por',
            contype: 'f',
            def: 'FOREIGN KEY (expurgado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_tipo_instituicao',
            contype: 'c',
            def: 'CHECK (tipo_solicitante IN (PESSOA_FISICA, INSTITUICAO))',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_numero_imovel',
            contype: 'c',
            def: 'CHECK (sem_numero_imovel)',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_coordenadas',
            contype: 'c',
            def: 'CHECK (latitude_ocorrencia)',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_ciclo_pessoal',
            contype: 'c',
            def: 'CHECK (cpf_solicitante)',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_aviso_privacidade',
            contype: 'c',
            def: 'CHECK (ciencia_aviso_privacidade = true)',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_cancelamento',
            contype: 'c',
            def: 'CHECK (cancelamento_status)',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_retencao',
            contype: 'c',
            def: 'CHECK (retencao_ate)',
          },
          {
            table_name: 'solicitacoes_svo_dados_externos',
            conname: 'chk_solicitacoes_svo_dados_externos_versao',
            contype: 'c',
            def: 'CHECK (versao_dados >= 1)',
          },
          {
            table_name: 'solicitacoes_svo_credenciais_externas',
            conname: 'fk_solicitacoes_svo_credenciais_externas_solicitacao',
            contype: 'f',
            def: 'FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'solicitacoes_svo_credenciais_externas',
            conname: 'uq_solicitacoes_svo_credenciais_idempotencia',
            contype: 'u',
            def: 'UNIQUE (chave_idempotencia_criacao)',
          },
          {
            table_name: 'solicitacoes_svo_credenciais_externas',
            conname: 'chk_solicitacoes_svo_credenciais_digest',
            contype: 'c',
            def: 'CHECK (segredo_digest)',
          },
          {
            table_name: 'solicitacoes_svo_credenciais_externas',
            conname: 'chk_solicitacoes_svo_credenciais_idempotencia',
            contype: 'c',
            def: 'CHECK (payload_criacao_digest)',
          },
          {
            table_name: 'solicitacoes_svo_credenciais_externas',
            conname: 'chk_solicitacoes_svo_credenciais_ciclo',
            contype: 'c',
            def: 'CHECK (revogada_em)',
          },
        ];

        return {
          rows: todas.filter((c) => `${c.table_name}.${c.conname}` !== opcoes?.omitirConstraint),
        };
      }

      if (sql.includes('FROM pg_indexes')) {
        const todosIdx = [
          {
            indexname: 'idx_solicitacoes_svo_canal_status_id',
            indexdef:
              'CREATE INDEX idx_solicitacoes_svo_canal_status_id ON public.solicitacoes_svo USING btree (canal_origem, status, id DESC)',
          },
          {
            indexname: 'idx_solicitacoes_svo_dados_externos_ocorrencia',
            indexdef:
              'CREATE INDEX idx_solicitacoes_svo_dados_externos_ocorrencia ON public.solicitacoes_svo_dados_externos USING btree (data_hora_ocorrencia DESC)',
          },
          {
            indexname: 'idx_solicitacoes_svo_dados_externos_cancelamento_pendente',
            indexdef:
              "CREATE INDEX idx_solicitacoes_svo_dados_externos_cancelamento_pendente ON public.solicitacoes_svo_dados_externos USING btree (cancelamento_solicitado_em) WHERE (cancelamento_status = 'PENDENTE')",
          },
          {
            indexname: 'idx_solicitacoes_svo_dados_externos_retencao_pendente',
            indexdef:
              'CREATE INDEX idx_solicitacoes_svo_dados_externos_retencao_pendente ON public.solicitacoes_svo_dados_externos USING btree (retencao_ate)',
          },
          {
            indexname: 'idx_solicitacoes_svo_credenciais_validade',
            indexdef:
              'CREATE INDEX idx_solicitacoes_svo_credenciais_validade ON public.solicitacoes_svo_credenciais_externas USING btree (valida_ate)',
          },
        ];

        return {
          rows: todosIdx.filter((i) => i.indexname !== opcoes?.omitirIndice),
        };
      }

      if (sql.includes('FROM pg_trigger')) {
        if (!sql.includes('t.relname AS table_name')) {
          return { rows: [] };
        }
        const todasTriggers = [
          {
            table_name: 'solicitacoes_svo_dados_externos',
            tgname: 'trg_validar_vinculo_canal_externo_dados_svo',
          },
          {
            table_name: 'solicitacoes_svo_credenciais_externas',
            tgname: 'trg_validar_vinculo_canal_externo_credenciais_svo',
          },
          {
            table_name: 'solicitacoes_svo',
            tgname: 'trg_proteger_integridade_canal_solicitacao_svo',
          },
        ];
        return {
          rows: todasTriggers.filter(
            (t) => `${t.table_name}.${t.tgname}` !== opcoes?.omitirTrigger
          ),
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
        count: () => ({
          first: async () => ({
            total: String(
              tabela === 'solicitacoes_svo' ? (opcoes?.totalSolicitacoesExternas ?? 0) : 0
            ),
          }),
        }),
      }),
      count: () => ({
        first: async () => ({
          total: String(
            tabela === 'solicitacoes_svo_dados_externos'
              ? (opcoes?.totalDadosExternos ?? 0)
              : tabela === 'solicitacoes_svo_credenciais_externas'
                ? (opcoes?.totalCredenciaisExternas ?? 0)
                : 0
          ),
        }),
      }),
    });
    knexMock.raw = raw;

    return { knexMock, sqlExecutados };
  }

  it('não utiliza IF EXISTS nem IF NOT EXISTS cegos no código-fonte da migration SCRUM-263', () => {
    const caminhoMigration = path.resolve(
      __dirname,
      '../../database/migrations/20261127130000_scrum_263_solicitacoes_externas_svo.js'
    );
    const codigoFonte = fs.readFileSync(caminhoMigration, 'utf-8');

    expect(codigoFonte).not.toMatch(/\bIF\s+EXISTS\b/i);
    expect(codigoFonte).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
  });

  it('evolui solicitacoes_svo com backfill INTERNA, registrante_id nullable, protocolo único opaco e cria tabelas protegidas com todos os campos da HU-01', async () => {
    const { knexMock, sqlExecutados } = criarKnexScrum263Mock();
    await migrationScrum263.up(knexMock);

    const ddlAlterSvo = sqlExecutados.find((item) =>
      item.sql.includes('ALTER TABLE solicitacoes_svo')
    );
    expect(ddlAlterSvo).toBeDefined();
    expect(ddlAlterSvo?.sql).toContain("SET canal_origem = 'INTERNA'");
    expect(ddlAlterSvo?.sql).toContain('ALTER COLUMN registrante_id DROP NOT NULL');
    expect(ddlAlterSvo?.sql).toContain('CONSTRAINT chk_solicitacoes_svo_canal_registrante_protocolo');
    expect(ddlAlterSvo?.sql).toContain('CONSTRAINT uq_solicitacoes_svo_protocolo');

    const ddlDadosExternos = sqlExecutados.find((item) =>
      item.sql.includes('CREATE TABLE solicitacoes_svo_dados_externos')
    );
    expect(ddlDadosExternos).toBeDefined();
    expect(ddlDadosExternos?.sql).toContain('REFERENCES solicitacoes_svo(id) ON DELETE RESTRICT');
    expect(ddlDadosExternos?.sql).toContain('cpf_solicitante CHAR(11)');
    expect(ddlDadosExternos?.sql).toContain('tipo_solicitante VARCHAR(20) NOT NULL');
    expect(ddlDadosExternos?.sql).toContain('nome_instituicao VARCHAR(180)');
    expect(ddlDadosExternos?.sql).toContain('nome_falecido VARCHAR(150)');
    expect(ddlDadosExternos?.sql).toContain('documento_falecido VARCHAR(60)');
    expect(ddlDadosExternos?.sql).toContain('latitude_ocorrencia DOUBLE PRECISION');
    expect(ddlDadosExternos?.sql).toContain('longitude_ocorrencia DOUBLE PRECISION');
    expect(ddlDadosExternos?.sql).toContain('informacoes_medicas VARCHAR(2000)');
    expect(ddlDadosExternos?.sql).toContain('ciencia_aviso_privacidade BOOLEAN NOT NULL');
    expect(ddlDadosExternos?.sql).toContain('versao_aviso_privacidade VARCHAR(40) NOT NULL');

    const ddlCredenciais = sqlExecutados.find((item) =>
      item.sql.includes('CREATE TABLE solicitacoes_svo_credenciais_externas')
    );
    expect(ddlCredenciais).toBeDefined();
    expect(ddlCredenciais?.sql).toContain('segredo_digest CHAR(64) NOT NULL');
    expect(ddlCredenciais?.sql).toContain('chave_idempotencia_criacao VARCHAR(120)');
    expect(ddlCredenciais?.sql).toContain('payload_criacao_digest CHAR(64)');
  });

  it('bloqueia up quando as tabelas base usuarios e solicitacoes_svo não estão presentes no schema alvo', async () => {
    const semBase = criarKnexScrum263Mock({ tabelasBaseCount: 1 });
    await expect(migrationScrum263.up(semBase.knexMock)).rejects.toThrow(
      /tabelas base \(usuarios, solicitacoes_svo\) ausentes no schema alvo/
    );
  });

  it('rejeita estruturas preexistentes incompatíveis em validarCatalogoScrum263', async () => {
    const registranteNaoNulavel = criarKnexScrum263Mock({ nullableRegistranteId: 'NO' });
    await expect(
      migrationScrum263.validarCatalogoScrum263(registranteNaoNulavel.knexMock)
    ).rejects.toThrow(/Estrutura incompativel em solicitacoes_svo\.registrante_id/);

    const tipoCpfInvalido = criarKnexScrum263Mock({ tipoCpfSolicitante: 'text' });
    await expect(
      migrationScrum263.validarCatalogoScrum263(tipoCpfInvalido.knexMock)
    ).rejects.toThrow(/Estrutura incompativel em solicitacoes_svo_dados_externos\.cpf_solicitante/);

    const semConstraint = criarKnexScrum263Mock({
      omitirConstraint: 'solicitacoes_svo.uq_solicitacoes_svo_protocolo',
    });
    await expect(
      migrationScrum263.validarCatalogoScrum263(semConstraint.knexMock)
    ).rejects.toThrow(
      /Constraint obrigatoria ausente ou incompativel: solicitacoes_svo\.uq_solicitacoes_svo_protocolo/
    );

    const semIndice = criarKnexScrum263Mock({
      omitirIndice: 'idx_solicitacoes_svo_canal_status_id',
    });
    await expect(
      migrationScrum263.validarCatalogoScrum263(semIndice.knexMock)
    ).rejects.toThrow(
      /Indice obrigatorio ausente ou incompativel: idx_solicitacoes_svo_canal_status_id/
    );

    const semTrigger = criarKnexScrum263Mock({
      omitirTrigger:
        'solicitacoes_svo_dados_externos.trg_validar_vinculo_canal_externo_dados_svo',
    });
    await expect(
      migrationScrum263.validarCatalogoScrum263(semTrigger.knexMock)
    ).rejects.toThrow(
      /Trigger obrigatoria ausente: solicitacoes_svo_dados_externos\.trg_validar_vinculo_canal_externo_dados_svo/
    );
  });

  it('interpola current_schema nos comandos REVOKE e GRANT granulares sem DELETE para a role da aplicação', async () => {
    const appUserAnterior = process.env.POSTGRES_APP_USER;
    process.env.POSTGRES_APP_USER = 'frotas_app';
    try {
      const { knexMock, sqlExecutados } = criarKnexScrum263Mock({
        schemaAtual: 'schema_isolado_263',
        roleAppPresente: true,
      });

      await migrationScrum263.up(knexMock);

      const cmdRevoke = sqlExecutados.find((item) =>
        item.sql.includes(
          'REVOKE ALL PRIVILEGES ON TABLE ??.solicitacoes_svo_dados_externos, ??.solicitacoes_svo_credenciais_externas FROM ??'
        )
      );
      expect(cmdRevoke).toBeDefined();
      expect(cmdRevoke?.bindings).toEqual([
        'schema_isolado_263',
        'schema_isolado_263',
        'frotas_app',
      ]);

      const cmdGrantDados = sqlExecutados.find((item) =>
        item.sql.includes('ON TABLE ??.solicitacoes_svo_dados_externos TO ??')
      );
      expect(cmdGrantDados).toBeDefined();
      expect(cmdGrantDados?.sql).not.toContain('DELETE');
      expect(cmdGrantDados?.sql).not.toContain('cpf_solicitante');
      expect(cmdGrantDados?.bindings).toEqual(['schema_isolado_263', 'frotas_app']);
    } finally {
      if (appUserAnterior === undefined) {
        delete process.env.POSTGRES_APP_USER;
      } else {
        process.env.POSTGRES_APP_USER = appUserAnterior;
      }
    }
  });

  it('bloqueia rollback (down) quando há dados externos, credenciais ou solicitações EXTERNA persistidas', async () => {
    const comDadosExternos = criarKnexScrum263Mock({ totalDadosExternos: 1 });
    await expect(migrationScrum263.down(comDadosExternos.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem registros em solicitacoes_svo_dados_externos/
    );

    const comCredenciais = criarKnexScrum263Mock({ totalCredenciaisExternas: 1 });
    await expect(migrationScrum263.down(comCredenciais.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem registros em solicitacoes_svo_credenciais_externas/
    );

    const comSolicitacoesExternas = criarKnexScrum263Mock({ totalSolicitacoesExternas: 1 });
    await expect(migrationScrum263.down(comSolicitacoesExternas.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem solicitacoes em solicitacoes_svo com canal_origem EXTERNA/
    );
  });

  it('rejeita role da aplicação que possua DELETE nas tabelas protegidas de solicitações externas SVO', () => {
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
      podeDeletarPreferenciasNotificacao: false,
      podeDeletarDadosExternosSvo: true,
      privilegiosExcessivosTabelas: [] as string[],
    };

    expect(() => provisionarModule.validarEstadoMinimoPrivilegio(baseRole)).toThrow(
      /nao pode ter privilegio DELETE sobre as tabelas protegidas de solicitacoes externas SVO/
    );
  });
});
