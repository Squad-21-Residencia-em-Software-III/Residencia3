import { describe, expect, it, vi } from 'vitest';

// Instância real do knex, sem conexão: permite conferir o SQL gerado sem banco
vi.mock('../config/database', async () => {
  const { default: knex } = await import('knex');
  return { db: knex({ client: 'pg' }) };
});

import { COLUNAS_DE_VIAGENS, consultasRelatorio } from '../models/relatorioModel';
import { VIAGENS_UNIFICADAS_SQL } from '../models/viagemModel';

const LIMITE = 51;
const sem = {};
const ADMINISTRATIVA = ['ADMINISTRATIVA' as const];
const AS_DUAS = ['ADMINISTRATIVA' as const, 'SVO' as const];

const gerar = (consulta: { toSQL: () => { sql: string; bindings: readonly unknown[] } }) => {
  const { sql, bindings } = consulta.toSQL();
  return { sql: sql.replace(/\s+/g, ' '), bindings };
};

describe('isolamento por tipo de frota nas consultas (RF18/RN20)', () => {
  const consultas = [
    ['abastecimentos', (tipos: ('ADMINISTRATIVA' | 'SVO')[], periodo = sem) => consultasRelatorio.abastecimentos(periodo, LIMITE, tipos)],
    ['manutencoes', (tipos: ('ADMINISTRATIVA' | 'SVO')[], periodo = sem) => consultasRelatorio.manutencoes(periodo, LIMITE, tipos)],
    ['multas', (tipos: ('ADMINISTRATIVA' | 'SVO')[], periodo = sem) => consultasRelatorio.multas(periodo, LIMITE, tipos)],
  ] as const;

  it.each(consultas)('%s: restringe pelo tipo de frota do veículo para o Gestor de Frota', (_tipo, montar) => {
    const { sql, bindings } = gerar(montar(ADMINISTRATIVA));

    expect(sql).toContain('"v"."tipo_frota" in (?)');
    expect(bindings).toContain('ADMINISTRATIVA');
    expect(bindings).not.toContain('SVO');
  });

  it.each(consultas)('%s: não filtra por frota quando o perfil enxerga as duas (Administrador)', (_tipo, montar) => {
    const { sql } = gerar(montar(AS_DUAS));

    expect(sql).not.toContain('tipo_frota');
  });

  it.each(consultas)('%s: não retorna nada para perfil sem frota permitida', (_tipo, montar) => {
    const { sql, bindings } = gerar(montar([]));

    // condição sempre falsa (1 = 0): nenhuma linha é retornada
    expect(sql).toContain('where 1 = ?');
    expect(bindings).toContain(0);
  });

  it.each(consultas)('%s: combina a restrição de frota com o filtro de período', (_tipo, montar) => {
    const { sql, bindings } = gerar(montar(ADMINISTRATIVA, { inicio: '2026-11-01', fim: '2026-11-30' }));

    expect(sql).toContain('"v"."tipo_frota" in (?)');
    expect(sql).toMatch(/ and /);
    expect(bindings).toContain('ADMINISTRATIVA');
    expect(bindings).toContain('2026-11-01');
    expect(bindings).toContain('2026-11-30');
  });
});

describe('filtros de período nas consultas', () => {
  it('compara colunas de data diretamente, de forma inclusiva (abastecimentos e manutenções)', () => {
    const abastecimentos = gerar(consultasRelatorio.abastecimentos({ inicio: '2026-11-01', fim: '2026-11-30' }, LIMITE, AS_DUAS));
    const manutencoes = gerar(consultasRelatorio.manutencoes({ inicio: '2026-11-01', fim: '2026-11-30' }, LIMITE, AS_DUAS));

    expect(abastecimentos.sql).toContain('"a"."data_abastecimento" >= ?');
    expect(abastecimentos.sql).toContain('"a"."data_abastecimento" <= ?');
    expect(manutencoes.sql).toContain('"ma"."data_manutencao" >= ?');
    expect(manutencoes.sql).toContain('"ma"."data_manutencao" <= ?');
  });

  it('converte o período para o horário de Brasília nos instantes (multas e viagens)', () => {
    const multas = gerar(consultasRelatorio.multas({ inicio: '2026-11-01', fim: '2026-11-30' }, LIMITE, AS_DUAS));
    const viagens = gerar(consultasRelatorio.viagens(AS_DUAS, { inicio: '2026-11-01', fim: '2026-11-30' }, LIMITE));

    for (const { sql, bindings } of [multas, viagens]) {
      expect(sql).toContain('AT TIME ZONE ?');
      expect(sql).toContain('CAST(? AS date) + 1');
      expect(bindings).toContain('America/Sao_Paulo');
    }
  });

  it('não acrescenta condição de data quando não há período', () => {
    for (const { sql } of [
      gerar(consultasRelatorio.abastecimentos(sem, LIMITE, AS_DUAS)),
      gerar(consultasRelatorio.multas(sem, LIMITE, AS_DUAS)),
      gerar(consultasRelatorio.viagens(AS_DUAS, sem, LIMITE)),
    ]) {
      expect(sql).not.toContain('AT TIME ZONE');
      expect(sql).not.toContain('>= ?');
    }
  });

  it('aplica o limite de linhas', () => {
    expect(gerar(consultasRelatorio.multas(sem, 123, AS_DUAS)).bindings).toContain(123);
  });
});

describe('viagens', () => {
  it('filtra pelos tipos de operação permitidos ao perfil', () => {
    const { sql, bindings } = gerar(consultasRelatorio.viagens(ADMINISTRATIVA, sem, LIMITE));

    expect(sql).toContain('"tipo_operacao" in (?)');
    expect(bindings).toContain('ADMINISTRATIVA');
    expect(bindings).not.toContain('SVO');
  });

  // Protege contra mudanças na consulta unificada (por exemplo, nova regra de agendamento SVO)
  it.each(COLUNAS_DE_VIAGENS)('a consulta unificada de viagens fornece a coluna %s', (coluna) => {
    expect(VIAGENS_UNIFICADAS_SQL).toMatch(new RegExp(`(\\bAS\\s+${coluna}\\b|\\.${coluna}\\b|\\b${coluna}\\b,)`));
  });
});
