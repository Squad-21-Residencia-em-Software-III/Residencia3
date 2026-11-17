import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';
const { auditoria } = vi.hoisted(() => ({ auditoria: vi.fn() }));
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: auditoria },
  MODULOS_AUDITORIA: { VIAGENS: 'VIAGENS' },
}));
import { reavaliarFilaSvo } from '../services/filaSvoService';

type Linha = Record<string, any>;
function banco(tabelas: Record<string, Linha[]>, agora: Date) {
  const trx = (tabela: string) => {
    const filtros: ((item: Linha) => boolean)[] = [];
    let dados: Linha | undefined;
    const q: Record<string, any> = {
      where(campo: string | Linha, operador?: unknown, valor?: unknown) {
        if (typeof campo === 'object') filtros.push((item) => Object.entries(campo).every(([c, v]) => item[c] === v));
        else if (operador === '<=') filtros.push((item) => item[campo] <= valor!);
        else if (operador === '>=') filtros.push((item) => item[campo] >= valor!);
        else if (operador === '>') filtros.push((item) => item[campo] > valor!);
        else filtros.push((item) => item[campo] === operador);
        return q;
      },
      whereIn(campo: string, valores: unknown[]) { filtros.push((item) => valores.includes(item[campo])); return q; },
      select() { return q; },
      orderBy() { return q; },
      forUpdate() { return q; },
      async first() { return (tabelas[tabela] ?? []).find((item) => filtros.every((f) => f(item))); },
      async update(valores: Linha) {
        for (const item of tabelas[tabela] ?? []) if (filtros.every((f) => f(item))) Object.assign(item, valores);
      },
      async insert(valores: Linha) { dados = { id: (tabelas[tabela]?.length ?? 0) + 1, ...valores }; (tabelas[tabela] ??= []).push(dados); },
      then(resolve: (valor: Linha[]) => void, reject: (erro: unknown) => void) {
        return Promise.resolve((tabelas[tabela] ?? []).filter((item) => filtros.every((f) => f(item)))).then(resolve, reject);
      },
    };
    return q;
  };
  return Object.assign(trx, { raw: async () => ({ rows: [{ agora }] }) }) as unknown as Knex.Transaction;
}
const momento = (hora: string) => new Date(`2099-01-01T${hora}:00Z`);
const ordem = (id: number, inicio: string, fim: string, status = 'ALOCADA') => ({
  id, status, veiculo_id: 1, motorista_id: 2, equipe_id: 3,
  capacidade_utilizada: 1,
  inicio_previsto: momento(inicio), fim_previsto: momento(fim), liberada_em: null,
});

describe('fila de coletas SVO', () => {
  beforeEach(() => auditoria.mockReset());
  it('mantém recursos ocupados no atraso e libera somente a próxima elegível após a conclusão', async () => {
    const tabelas = {
      ordens_svo: [ordem(1, '14:00', '16:00', 'EM_DESLOCAMENTO'), ordem(2, '16:20', '17:00'), ordem(3, '16:30', '17:30')],
      veiculos: [{ id: 1, status: 'DISPONIVEL', tipo_frota: 'SVO', capacidade_maxima: 4 }],
      motoristas: [{ id: 2, status: 'DISPONIVEL', tipo_motorista: 'SVO', validade_cnh: '2099-12-31' }],
      equipes_svo: [{ id: 3 }],
      escalas_svo: [{ equipe_id: 3, data_inicio: momento('08:00'), data_fim: momento('23:00') }],
      alertas_atraso_svo: [] as Linha[],
    };
    const trx = banco(tabelas, momento('16:40'));
    await reavaliarFilaSvo(trx, 7);
    await reavaliarFilaSvo(trx, 7);
    expect(tabelas.alertas_atraso_svo).toHaveLength(2);
    expect(tabelas.ordens_svo[1].liberada_em).toBeNull();
    tabelas.ordens_svo[0].status = 'CONCLUIDA';
    await reavaliarFilaSvo(trx, 7);
    expect(tabelas.ordens_svo[1].liberada_em).toEqual(momento('16:40'));
    expect(tabelas.ordens_svo[2].liberada_em).toBeNull();
    expect(tabelas.ordens_svo[1].status).toBe('ALOCADA');
    expect(tabelas.ordens_svo[1]).not.toHaveProperty('km_inicial');
    expect(tabelas.ordens_svo[1]).not.toHaveProperty('data_hora_saida');
    tabelas.ordens_svo[1].status = 'CONCLUIDA';
    await reavaliarFilaSvo(trx, 7);
    expect(tabelas.ordens_svo[2].liberada_em).toEqual(momento('16:40'));
  });
  it('libera equipe existente sem escala cadastrada', async () => {
    const tabelas = {
      ordens_svo: [ordem(2, '16:20', '17:00')],
      veiculos: [{ id: 1, status: 'DISPONIVEL', tipo_frota: 'SVO', capacidade_maxima: 4 }],
      motoristas: [{ id: 2, status: 'DISPONIVEL', tipo_motorista: 'SVO', validade_cnh: '2099-12-31' }],
      equipes_svo: [{ id: 3 }], escalas_svo: [], alertas_atraso_svo: [],
    };
    await reavaliarFilaSvo(banco(tabelas, momento('16:40')), 7);
    expect(tabelas.ordens_svo[0].liberada_em).toEqual(momento('16:40'));
  });
  it('não libera quando a capacidade disponível caiu abaixo da ordem', async () => {
    const tabelas = {
      ordens_svo: [{ ...ordem(2, '16:20', '17:00'), capacidade_utilizada: 3 }],
      veiculos: [{ id: 1, status: 'DISPONIVEL', tipo_frota: 'SVO', capacidade_maxima: 2 }],
      motoristas: [{ id: 2, status: 'DISPONIVEL', tipo_motorista: 'SVO', validade_cnh: '2099-12-31' }],
      equipes_svo: [{ id: 3 }], escalas_svo: [{ equipe_id: 3, data_inicio: momento('08:00'), data_fim: momento('23:00') }],
      alertas_atraso_svo: [],
    };
    await reavaliarFilaSvo(banco(tabelas, momento('16:40')), 7);
    expect(tabelas.ordens_svo[0].liberada_em).toBeNull();
  });
});
