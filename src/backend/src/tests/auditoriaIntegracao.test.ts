
import '../../knexfile';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import type { Knex } from 'knex';
import { db } from '../config/database';
import { auditoriaModel } from '../models/auditoriaModel';

const BANCO_PERMITIDO = 'frotas_svo_testes_bl04';

const executarIntegracao =
  process.env.RUN_DB_INTEGRATION === 'true';

describe.skipIf(!executarIntegracao)(
  'Integração BL04 - PostgreSQL real',
  () => {
    let transacao: Knex.Transaction | undefined;
    let idsCriados: number[] = [];

    beforeAll(async () => {
      // Abre uma transação, sem realizar escritas.
      transacao = await db.transaction();

      try {
        // Confere o banco da MESMA conexão
        // que será utilizada nas inserções.
        const resultado = await transacao.raw(
          'SELECT current_database() AS nome'
        );

        const bancoAtual = resultado.rows[0]?.nome;

        if (bancoAtual !== BANCO_PERMITIDO) {
          throw new Error(
            `Teste bloqueado: conectado ao banco "${bancoAtual}". ` +
            `Somente "${BANCO_PERMITIDO}" é permitido.`
          );
        }

        // Os cinco registros são criados
        // exclusivamente para esta execução.
        const registros = [
          {
            usuario_id: null,
            acao: 'BL04_TESTE_A',
            modulo: 'VIAGENS',
            data_hora: '2026-11-01 10:00:00',
          },
          {
            usuario_id: null,
            acao: 'BL04_TESTE_B',
            modulo: 'VIAGENS',
            data_hora: '2026-11-02 10:00:00',
          },
          {
            usuario_id: null,
            acao: 'BL04_TESTE_C',
            modulo: 'VIAGENS',
            data_hora: '2026-11-03 10:00:00',
          },
          {
            usuario_id: null,
            acao: 'BL04_TESTE_D',
            modulo: 'VIAGENS',
            data_hora: '2026-11-04 10:00:00',
          },
          {
            usuario_id: null,
            acao: 'BL04_TESTE_E',
            modulo: 'VIAGENS',
            data_hora: '2026-11-04 10:00:00',
          },
        ];

        const inseridos = await transacao('auditorias')
          .insert(registros)
          .returning('id');

        idsCriados = inseridos.map(
          (registro: { id: number }) => registro.id
        );

        expect(idsCriados).toHaveLength(5);
      } catch (erro) {
        if (transacao && !transacao.isCompleted()) {
          await transacao.rollback();
        }

        throw erro;
      }
    });

    afterAll(async () => {
      try {
        if (transacao && !transacao.isCompleted()) {
          // O rollback desfaz as inserções
          // realizadas nesta transação.
          await transacao.rollback();
        }
      } finally {
        await db.destroy();
      }
    });

    it('deve consultar a primeira página na ordem correta', async () => {
      if (!transacao) {
        throw new Error('Transação não inicializada');
      }

      const resultado = await auditoriaModel.listar(
        1,
        2,
        transacao,
        idsCriados
      );

      const idsEsperados = [
        idsCriados[4],
        idsCriados[3],
      ];

      expect(resultado.total).toBe(5);
      expect(resultado.dados).toHaveLength(2);

      expect(
        resultado.dados.map((registro) => registro.id)
      ).toEqual(idsEsperados);
    });

    it('deve consultar a segunda página na ordem correta', async () => {
      if (!transacao) {
        throw new Error('Transação não inicializada');
      }

      const resultado = await auditoriaModel.listar(
        2,
        2,
        transacao,
        idsCriados
      );

      const idsEsperados = [
        idsCriados[2],
        idsCriados[1],
      ];

      expect(resultado.total).toBe(5);
      expect(resultado.dados).toHaveLength(2);

      expect(
        resultado.dados.map((registro) => registro.id)
      ).toEqual(idsEsperados);
    });

    it('deve consultar a última página corretamente', async () => {
      if (!transacao) {
        throw new Error('Transação não inicializada');
      }

      const resultado = await auditoriaModel.listar(
        3,
        2,
        transacao,
        idsCriados
      );

      expect(resultado.total).toBe(5);
      expect(resultado.dados).toHaveLength(1);
      expect(resultado.dados[0].id).toBe(idsCriados[0]);
    });

    it('deve respeitar o desempate por id DESC', async () => {
      if (!transacao) {
        throw new Error('Transação não inicializada');
      }

      const resultado = await auditoriaModel.listar(
        1,
        5,
        transacao,
        idsCriados
      );

      expect(resultado.total).toBe(5);

      expect(
        resultado.dados.map((registro) => registro.id)
      ).toEqual([
        idsCriados[4],
        idsCriados[3],
        idsCriados[2],
        idsCriados[1],
        idsCriados[0],
      ]);
    });
  }
);
