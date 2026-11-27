import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const provisionarModule = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migrationEvidenciasOdometroEDeslocamentosSvo = require('../../database/migrations/20261118121000_scrum_210_evidencias_odometro_e_deslocamentos_svo.js') as {
  up: (knex: unknown) => Promise<void>;
  down: (knex: unknown) => Promise<void>;
  validarCatalogoScrum210: (knex: unknown) => Promise<void>;
};

describe('Contrato de banco, migration e privilégios de evidências de odômetro e deslocamentos SVO (evidências de odômetro)', () => {
  function criarKnexEvidenciasOdometroEDeslocamentosSvoMock(opcoes?: {
    tabelasOrigemCount?: number;
    tipoSha256?: string;
    omitirConstraint?: string;
    omitirIndice?: string;
    totalEvidencias?: number;
    totalVinculosOrdens?: number;
    totalDeslocamentos?: number;
  }) {
    const sqlExecutados: string[] = [];

    const raw = vi.fn(async (sql: string) => {
      sqlExecutados.push(sql);

      if (sql.includes('current_schema()')) {
        return { rows: [{ schema_atual: 'public' }] };
      }

      if (sql.includes("table_name IN ('viagens_frota', 'ordens_svo'")) {
        const qtd = opcoes?.tabelasOrigemCount ?? 6;
        return {
          rows: Array.from({ length: qtd }, (_, i) => ({ table_name: `t_${i}` })),
        };
      }

      if (sql.includes('FROM information_schema.columns')) {
        if (sql.includes('deslocamentos_svo_ordens')) {
          return {
            rows: [
              { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'deslocamento_svo_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'ordem_svo_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'vinculado_em', data_type: 'timestamp with time zone', is_nullable: 'NO' },
              { column_name: 'vinculado_por', data_type: 'integer', is_nullable: 'NO' },
            ],
          };
        }
        return { rows: [] };
      }

      if (sql.includes('FROM pg_constraint')) {
        const todas = [
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_veiculo',
            contype: 'f',
            def: 'FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_motorista',
            contype: 'f',
            def: 'FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_iniciado_por',
            contype: 'f',
            def: 'FOREIGN KEY (iniciado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_finalizado_por',
            contype: 'f',
            def: 'FOREIGN KEY (finalizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_km_inicial',
            contype: 'c',
            def: 'CHECK ((km_inicial >= 0))',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_km_coerente',
            contype: 'c',
            def: 'CHECK ((km_final IS NULL OR km_final >= km_inicial))',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_status',
            contype: 'c',
            def: "CHECK ((status IN ('EM_CURSO', 'CONCLUIDO', 'CANCELADO')))",
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_conclusao',
            contype: 'c',
            def: 'CHECK ((data_hora_conclusao IS NOT NULL))',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'fk_deslocamentos_svo_ordens_deslocamento',
            contype: 'f',
            def: 'FOREIGN KEY (deslocamento_svo_id) REFERENCES deslocamentos_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'fk_deslocamentos_svo_ordens_ordem',
            contype: 'f',
            def: 'FOREIGN KEY (ordem_svo_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'fk_deslocamentos_svo_ordens_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (vinculado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'uq_deslocamentos_svo_ordens_ordem',
            contype: 'u',
            def: 'UNIQUE (ordem_svo_id)',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'uq_deslocamentos_svo_ordens_par',
            contype: 'u',
            def: 'UNIQUE (deslocamento_svo_id, ordem_svo_id)',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_viagem_frota',
            contype: 'f',
            def: 'FOREIGN KEY (viagem_frota_id) REFERENCES viagens_frota(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_deslocamento_svo',
            contype: 'f',
            def: 'FOREIGN KEY (deslocamento_svo_id) REFERENCES deslocamentos_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_ordem_svo',
            contype: 'f',
            def: 'FOREIGN KEY (ordem_svo_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_veiculo',
            contype: 'f',
            def: 'FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_motorista',
            contype: 'f',
            def: 'FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_motorista_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (motorista_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_excecao_aprovador',
            contype: 'f',
            def: 'FOREIGN KEY (excecao_aprovada_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_expurgado_por',
            contype: 'f',
            def: 'FOREIGN KEY (expurgado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_registrado_por',
            contype: 'f',
            def: 'FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_auditoria',
            contype: 'f',
            def: 'FOREIGN KEY (auditoria_id) REFERENCES auditorias(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_tipo_operacao',
            contype: 'c',
            def: "CHECK ((tipo_operacao IN ('ADMINISTRATIVA', 'SVO')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_fase',
            contype: 'c',
            def: "CHECK ((fase IN ('SAIDA', 'CHEGADA')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_origem_operacao',
            contype: 'c',
            def: 'CHECK ((viagem_frota_id IS NOT NULL))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_km',
            contype: 'c',
            def: 'CHECK ((km_registrado >= 0))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_modalidade',
            contype: 'c',
            def: "CHECK ((modalidade IN ('FOTO', 'EXCECAO_GESTOR')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_status',
            contype: 'c',
            def: "CHECK ((status IN ('STAGING', 'ATIVA', 'SUBSTITUIDA', 'REJEITADA', 'EXPURGADA_RETENCAO')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_storage_key_segura',
            contype: 'c',
            def: 'CHECK ((storage_key IS NULL))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_mime',
            contype: 'c',
            def: "CHECK ((mime_type IN ('image/jpeg', 'image/png', 'image/webp')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_tamanho',
            contype: 'c',
            def: 'CHECK ((tamanho_bytes > 0))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_sha256',
            contype: 'c',
            def: 'CHECK ((sha256 IS NOT NULL))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_modalidade_dados',
            contype: 'c',
            def: 'CHECK ((excecao_aprovada_por <> motorista_usuario_id))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_retencao',
            contype: 'c',
            def: 'CHECK ((retencao_ate IS NOT NULL))',
          },
        ];

        return {
          rows: todas.filter((c) => `${c.table_name}.${c.conname}` !== opcoes?.omitirConstraint),
        };
      }

      if (sql.includes('FROM pg_indexes')) {
        const todosIdx = [
          {
            indexname: 'uq_deslocamentos_svo_veiculo_em_curso',
            indexdef: 'CREATE UNIQUE INDEX uq_deslocamentos_svo_veiculo_em_curso ON public.deslocamentos_svo',
          },
          {
            indexname: 'uq_deslocamentos_svo_motorista_em_curso',
            indexdef: 'CREATE UNIQUE INDEX uq_deslocamentos_svo_motorista_em_curso ON public.deslocamentos_svo',
          },
          {
            indexname: 'idx_deslocamentos_svo_status_conclusao',
            indexdef: 'CREATE INDEX idx_deslocamentos_svo_status_conclusao ON public.deslocamentos_svo (status, data_hora_conclusao)',
          },
          {
            indexname: 'idx_deslocamentos_svo_ordens_deslocamento',
            indexdef: 'CREATE INDEX idx_deslocamentos_svo_ordens_deslocamento ON public.deslocamentos_svo_ordens (deslocamento_svo_id)',
          },
          {
            indexname: 'uq_evidencias_odometro_viagem_frota_fase_ativa',
            indexdef: 'CREATE UNIQUE INDEX uq_evidencias_odometro_viagem_frota_fase_ativa ON public.evidencias_odometro',
          },
          {
            indexname: 'uq_evidencias_odometro_deslocamento_svo_fase_ativa',
            indexdef: 'CREATE UNIQUE INDEX uq_evidencias_odometro_deslocamento_svo_fase_ativa ON public.evidencias_odometro',
          },
          {
            indexname: 'uq_evidencias_odometro_storage_key',
            indexdef: 'CREATE UNIQUE INDEX uq_evidencias_odometro_storage_key ON public.evidencias_odometro',
          },
          {
            indexname: 'idx_evidencias_odometro_retencao_pendente',
            indexdef: 'CREATE INDEX idx_evidencias_odometro_retencao_pendente ON public.evidencias_odometro (retencao_ate)',
          },
          {
            indexname: 'idx_evidencias_odometro_operacao_criado',
            indexdef: 'CREATE INDEX idx_evidencias_odometro_operacao_criado ON public.evidencias_odometro (tipo_operacao)',
          },
        ];

        return {
          rows: todosIdx.filter((i) => i.indexname !== opcoes?.omitirIndice),
        };
      }

      return { rows: [] };
    });

    // Ajusta retorno parametrizado de information_schema.columns por nomeTabela
    raw.mockImplementation(async (sql: string, bindings?: unknown[]) => {
      sqlExecutados.push(sql);

      if (sql.includes('current_schema()')) {
        return { rows: [{ schema_atual: 'public' }] };
      }

      if (sql.includes("table_name IN ('viagens_frota', 'ordens_svo'")) {
        const qtd = opcoes?.tabelasOrigemCount ?? 6;
        return {
          rows: Array.from({ length: qtd }, (_, i) => ({ table_name: `t_${i}` })),
        };
      }

      if (sql.includes('FROM information_schema.columns')) {
        const tabela = Array.isArray(bindings) ? bindings[1] : undefined;
        if (tabela === 'deslocamentos_svo') {
          return {
            rows: [
              { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'veiculo_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'motorista_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'iniciado_por', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'finalizado_por', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'km_inicial', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'km_final', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'data_hora_saida', data_type: 'timestamp with time zone', is_nullable: 'NO' },
              { column_name: 'data_hora_conclusao', data_type: 'timestamp with time zone', is_nullable: 'YES' },
              { column_name: 'status', data_type: 'character varying', is_nullable: 'NO' },
            ],
          };
        }
        if (tabela === 'deslocamentos_svo_ordens') {
          return {
            rows: [
              { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'deslocamento_svo_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'ordem_svo_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'vinculado_em', data_type: 'timestamp with time zone', is_nullable: 'NO' },
              { column_name: 'vinculado_por', data_type: 'integer', is_nullable: 'NO' },
            ],
          };
        }
        if (tabela === 'evidencias_odometro') {
          return {
            rows: [
              { column_name: 'id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'tipo_operacao', data_type: 'character varying', is_nullable: 'NO' },
              { column_name: 'fase', data_type: 'character varying', is_nullable: 'NO' },
              { column_name: 'viagem_frota_id', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'deslocamento_svo_id', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'ordem_svo_id', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'veiculo_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'motorista_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'motorista_usuario_id', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'km_registrado', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'modalidade', data_type: 'character varying', is_nullable: 'NO' },
              { column_name: 'status', data_type: 'character varying', is_nullable: 'NO' },
              { column_name: 'storage_key', data_type: 'character varying', is_nullable: 'YES' },
              { column_name: 'mime_type', data_type: 'character varying', is_nullable: 'YES' },
              { column_name: 'tamanho_bytes', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'sha256', data_type: opcoes?.tipoSha256 ?? 'character', is_nullable: 'YES' },
              { column_name: 'excecao_aprovada_por', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'excecao_aprovada_em', data_type: 'timestamp with time zone', is_nullable: 'YES' },
              { column_name: 'excecao_justificativa', data_type: 'text', is_nullable: 'YES' },
              { column_name: 'conclusao_operacao_em', data_type: 'timestamp with time zone', is_nullable: 'YES' },
              { column_name: 'retencao_ate', data_type: 'timestamp with time zone', is_nullable: 'YES' },
              { column_name: 'preservacao_legal', data_type: 'boolean', is_nullable: 'NO' },
              { column_name: 'preservacao_motivo', data_type: 'text', is_nullable: 'YES' },
              { column_name: 'expurgado_em', data_type: 'timestamp with time zone', is_nullable: 'YES' },
              { column_name: 'expurgado_por', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'expurgo_motivo', data_type: 'character varying', is_nullable: 'YES' },
              { column_name: 'registrado_por', data_type: 'integer', is_nullable: 'NO' },
              { column_name: 'auditoria_id', data_type: 'integer', is_nullable: 'YES' },
              { column_name: 'criado_em', data_type: 'timestamp with time zone', is_nullable: 'NO' },
            ],
          };
        }
      }

      if (sql.includes('FROM pg_constraint')) {
        const todas = [
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_veiculo',
            contype: 'f',
            def: 'FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_motorista',
            contype: 'f',
            def: 'FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_iniciado_por',
            contype: 'f',
            def: 'FOREIGN KEY (iniciado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'fk_deslocamentos_svo_finalizado_por',
            contype: 'f',
            def: 'FOREIGN KEY (finalizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_km_inicial',
            contype: 'c',
            def: 'CHECK ((km_inicial >= 0))',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_km_coerente',
            contype: 'c',
            def: 'CHECK ((km_final IS NULL OR km_final >= km_inicial))',
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_status',
            contype: 'c',
            def: "CHECK ((status IN ('EM_CURSO', 'CONCLUIDO', 'CANCELADO')))",
          },
          {
            table_name: 'deslocamentos_svo',
            conname: 'chk_deslocamentos_svo_conclusao',
            contype: 'c',
            def: 'CHECK ((data_hora_conclusao IS NOT NULL))',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'fk_deslocamentos_svo_ordens_deslocamento',
            contype: 'f',
            def: 'FOREIGN KEY (deslocamento_svo_id) REFERENCES deslocamentos_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'fk_deslocamentos_svo_ordens_ordem',
            contype: 'f',
            def: 'FOREIGN KEY (ordem_svo_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'fk_deslocamentos_svo_ordens_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (vinculado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'uq_deslocamentos_svo_ordens_ordem',
            contype: 'u',
            def: 'UNIQUE (ordem_svo_id)',
          },
          {
            table_name: 'deslocamentos_svo_ordens',
            conname: 'uq_deslocamentos_svo_ordens_par',
            contype: 'u',
            def: 'UNIQUE (deslocamento_svo_id, ordem_svo_id)',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_viagem_frota',
            contype: 'f',
            def: 'FOREIGN KEY (viagem_frota_id) REFERENCES viagens_frota(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_deslocamento_svo',
            contype: 'f',
            def: 'FOREIGN KEY (deslocamento_svo_id) REFERENCES deslocamentos_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_ordem_svo',
            contype: 'f',
            def: 'FOREIGN KEY (ordem_svo_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_veiculo',
            contype: 'f',
            def: 'FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_motorista',
            contype: 'f',
            def: 'FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_motorista_usuario',
            contype: 'f',
            def: 'FOREIGN KEY (motorista_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_excecao_aprovador',
            contype: 'f',
            def: 'FOREIGN KEY (excecao_aprovada_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_expurgado_por',
            contype: 'f',
            def: 'FOREIGN KEY (expurgado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_registrado_por',
            contype: 'f',
            def: 'FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'fk_evidencias_odometro_auditoria',
            contype: 'f',
            def: 'FOREIGN KEY (auditoria_id) REFERENCES auditorias(id) ON DELETE RESTRICT',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_tipo_operacao',
            contype: 'c',
            def: "CHECK ((tipo_operacao IN ('ADMINISTRATIVA', 'SVO')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_fase',
            contype: 'c',
            def: "CHECK ((fase IN ('SAIDA', 'CHEGADA')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_origem_operacao',
            contype: 'c',
            def: 'CHECK ((viagem_frota_id IS NOT NULL))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_km',
            contype: 'c',
            def: 'CHECK ((km_registrado >= 0))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_modalidade',
            contype: 'c',
            def: "CHECK ((modalidade IN ('FOTO', 'EXCECAO_GESTOR')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_status',
            contype: 'c',
            def: "CHECK ((status IN ('STAGING', 'ATIVA', 'SUBSTITUIDA', 'REJEITADA', 'EXPURGADA_RETENCAO')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_storage_key_segura',
            contype: 'c',
            def: 'CHECK ((storage_key IS NULL))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_mime',
            contype: 'c',
            def: "CHECK ((mime_type IN ('image/jpeg', 'image/png', 'image/webp')))",
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_tamanho',
            contype: 'c',
            def: 'CHECK ((tamanho_bytes > 0))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_sha256',
            contype: 'c',
            def: 'CHECK ((sha256 IS NOT NULL))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_modalidade_dados',
            contype: 'c',
            def: 'CHECK ((excecao_aprovada_por <> motorista_usuario_id))',
          },
          {
            table_name: 'evidencias_odometro',
            conname: 'chk_evidencias_odometro_retencao',
            contype: 'c',
            def: 'CHECK ((retencao_ate IS NOT NULL))',
          },
        ];

        return {
          rows: todas.filter((c) => `${c.table_name}.${c.conname}` !== opcoes?.omitirConstraint),
        };
      }

      if (sql.includes('FROM pg_indexes')) {
        const todosIdx = [
          {
            indexname: 'uq_deslocamentos_svo_veiculo_em_curso',
            indexdef: 'CREATE UNIQUE INDEX uq_deslocamentos_svo_veiculo_em_curso ON public.deslocamentos_svo',
          },
          {
            indexname: 'uq_deslocamentos_svo_motorista_em_curso',
            indexdef: 'CREATE UNIQUE INDEX uq_deslocamentos_svo_motorista_em_curso ON public.deslocamentos_svo',
          },
          {
            indexname: 'idx_deslocamentos_svo_status_conclusao',
            indexdef: 'CREATE INDEX idx_deslocamentos_svo_status_conclusao ON public.deslocamentos_svo (status, data_hora_conclusao)',
          },
          {
            indexname: 'idx_deslocamentos_svo_ordens_deslocamento',
            indexdef: 'CREATE INDEX idx_deslocamentos_svo_ordens_deslocamento ON public.deslocamentos_svo_ordens (deslocamento_svo_id)',
          },
          {
            indexname: 'uq_evidencias_odometro_viagem_frota_fase_ativa',
            indexdef: 'CREATE UNIQUE INDEX uq_evidencias_odometro_viagem_frota_fase_ativa ON public.evidencias_odometro',
          },
          {
            indexname: 'uq_evidencias_odometro_deslocamento_svo_fase_ativa',
            indexdef: 'CREATE UNIQUE INDEX uq_evidencias_odometro_deslocamento_svo_fase_ativa ON public.evidencias_odometro',
          },
          {
            indexname: 'uq_evidencias_odometro_storage_key',
            indexdef: 'CREATE UNIQUE INDEX uq_evidencias_odometro_storage_key ON public.evidencias_odometro',
          },
          {
            indexname: 'idx_evidencias_odometro_retencao_pendente',
            indexdef: 'CREATE INDEX idx_evidencias_odometro_retencao_pendente ON public.evidencias_odometro (retencao_ate)',
          },
          {
            indexname: 'idx_evidencias_odometro_operacao_criado',
            indexdef: 'CREATE INDEX idx_evidencias_odometro_operacao_criado ON public.evidencias_odometro (tipo_operacao)',
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
        first: async () => undefined,
      }),
      count: () => ({
        first: async () => ({
          total: String(
            tabela === 'evidencias_odometro'
              ? (opcoes?.totalEvidencias ?? 0)
              : tabela === 'deslocamentos_svo_ordens'
                ? (opcoes?.totalVinculosOrdens ?? 0)
                : tabela === 'deslocamentos_svo'
                  ? (opcoes?.totalDeslocamentos ?? 0)
                  : 0
          ),
        }),
      }),
    });
    knexMock.raw = raw;

    return { knexMock, sqlExecutados };
  }

  it('bloqueia up quando tabelas base obrigatórias não estão presentes no schema', async () => {
    const semBase = criarKnexEvidenciasOdometroEDeslocamentosSvoMock({ tabelasOrigemCount: 4 });
    await expect(migrationEvidenciasOdometroEDeslocamentosSvo.up(semBase.knexMock)).rejects.toThrow(
      /tabelas base .* ausentes no schema alvo/
    );
  });

  it('rejeita estruturas preexistentes incompatíveis em validarCatalogoScrum210', async () => {
    const tipoInvalido = criarKnexEvidenciasOdometroEDeslocamentosSvoMock({ tipoSha256: 'text' });
    await expect(migrationEvidenciasOdometroEDeslocamentosSvo.validarCatalogoScrum210(tipoInvalido.knexMock)).rejects.toThrow(
      /Estrutura incompativel em evidencias_odometro\.sha256/
    );

    const semConstraint = criarKnexEvidenciasOdometroEDeslocamentosSvoMock({
      omitirConstraint: 'evidencias_odometro.chk_evidencias_odometro_retencao',
    });
    await expect(migrationEvidenciasOdometroEDeslocamentosSvo.validarCatalogoScrum210(semConstraint.knexMock)).rejects.toThrow(
      /Constraint obrigatoria ausente ou incompativel: evidencias_odometro\.chk_evidencias_odometro_retencao/
    );

    const semIndice = criarKnexEvidenciasOdometroEDeslocamentosSvoMock({
      omitirIndice: 'uq_evidencias_odometro_deslocamento_svo_fase_ativa',
    });
    await expect(migrationEvidenciasOdometroEDeslocamentosSvo.validarCatalogoScrum210(semIndice.knexMock)).rejects.toThrow(
      /Indice obrigatorio ausente ou incompativel: uq_evidencias_odometro_deslocamento_svo_fase_ativa/
    );
  });

  it('bloqueia rollback (down) quando há evidências, vínculos de ordens ou deslocamentos SVO', async () => {
    const comEvidencias = criarKnexEvidenciasOdometroEDeslocamentosSvoMock({ totalEvidencias: 1 });
    await expect(migrationEvidenciasOdometroEDeslocamentosSvo.down(comEvidencias.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem registros em evidencias_odometro/
    );

    const comVinculos = criarKnexEvidenciasOdometroEDeslocamentosSvoMock({ totalVinculosOrdens: 1 });
    await expect(migrationEvidenciasOdometroEDeslocamentosSvo.down(comVinculos.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem vinculos registrados em deslocamentos_svo_ordens/
    );

    const comDeslocamentos = criarKnexEvidenciasOdometroEDeslocamentosSvoMock({ totalDeslocamentos: 1 });
    await expect(migrationEvidenciasOdometroEDeslocamentosSvo.down(comDeslocamentos.knexMock)).rejects.toThrow(
      /Rollback bloqueado: existem deslocamentos registrados em deslocamentos_svo/
    );
  });

  it('executa DROP estrito (sem IF EXISTS) no down quando não há dados operacionais', async () => {
    const limpo = criarKnexEvidenciasOdometroEDeslocamentosSvoMock();
    await migrationEvidenciasOdometroEDeslocamentosSvo.down(limpo.knexMock);

    const ddlDown = limpo.sqlExecutados.find((sql) => sql.includes('DROP TABLE evidencias_odometro'));
    expect(ddlDown).toBeDefined();
    expect(ddlDown).not.toContain('IF EXISTS');
    expect(ddlDown).toContain('DROP INDEX uq_evidencias_odometro_viagem_frota_fase_ativa;');
    expect(ddlDown).toContain('DROP INDEX uq_deslocamentos_svo_veiculo_em_curso;');
  });

  it('rejeita role da aplicação que possua DELETE nas tabelas imutáveis de evidências e deslocamentos de odômetro', () => {
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
      podeDeletarEvidenciasOdometro: true,
      privilegiosExcessivosTabelas: [] as string[],
    };

    expect(() => provisionarModule.validarEstadoMinimoPrivilegio(baseRole)).toThrow(
      /nao pode ter privilegio DELETE sobre tabelas imutaveis de evidencias/
    );
  });
});
