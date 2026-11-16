import { describe, expect, it } from 'vitest';
import type { Veiculo } from '../types/veiculo';
import type { Viagem } from '../types/viagem';
import {
  adicionarDias,
  adicionarMeses,
  agruparRecursosAgenda,
  alocarSubfaixasBlocos,
  filtrarVeiculosPorPerfil,
  obterDiasSemana,
  obterGradeMes,
  obterResumoTrajeto,
  projetarViagensNoDia,
} from './agenda';

function criarViagemBase(parcial: Partial<Viagem> = {}): Viagem {
  return {
    id: 1,
    solicitacao_id: 10,
    tipo_operacao: 'ADMINISTRATIVA',
    origem: 'FSPH Sede - Aracaju',
    destino: 'Lacen - Aracaju',
    finalidade: 'Transporte de amostras',
    solicitante_nome: 'Ana Silva',
    inicio_previsto: '2026-10-19T08:00:00',
    fim_previsto: '2026-10-19T11:30:00',
    veiculo_id: 1,
    veiculo_modelo: 'Renault Master',
    veiculo_placa: 'QRM-1020',
    motorista_id: 2,
    motorista_nome: 'Carlos Souza',
    km_inicial: null,
    km_final: null,
    data_hora_efetiva_saida: null,
    data_hora_efetiva_chegada: null,
    status: 'AGENDADA',
    ...parcial,
  };
}

describe('agenda utils (grade 24h e projeção de viagens)', () => {
  it('projeta viagem administrativa com horários previstos na grade 24h', () => {
    const blocos = projetarViagensNoDia([criarViagemBase()], '2026-10-19');
    expect(blocos).toHaveLength(1);
    expect(blocos[0]).toMatchObject({
      chave: 'ADMINISTRATIVA-1',
      inicioMin: 8 * 60,
      fimMin: 11 * 60 + 30,
      horaInicioLabel: '08:00',
      horaFimLabel: '11:30',
      semPrevisaoFim: false,
    });
  });

  it('estende ordens SVO sem fim_previsto até o final do mesmo dia (23:59)', () => {
    const ordemSvo = criarViagemBase({
      id: 1,
      tipo_operacao: 'SVO',
      origem: null,
      destino: 'Hospital Regional de Lagarto',
      finalidade: null,
      inicio_previsto: '2026-10-19T02:15:00',
      fim_previsto: null,
    });

    const blocos = projetarViagensNoDia([ordemSvo], '2026-10-19');
    expect(blocos).toHaveLength(1);
    expect(blocos[0].chave).toBe('SVO-1');
    expect(blocos[0].inicioMin).toBe(2 * 60 + 15);
    expect(blocos[0].fimMin).toBe(1440);
    expect(blocos[0].horaFimLabel).toBe('23:59');
    expect(blocos[0].semPrevisaoFim).toBe(true);
    expect(obterResumoTrajeto(ordemSvo)).toBe('Coleta SVO → Hospital Regional de Lagarto');
  });

  it('usa data_hora_efetiva_chegada quando ordem SVO já foi concluída', () => {
    const ordemConcluida = criarViagemBase({
      id: 7,
      tipo_operacao: 'SVO',
      origem: null,
      destino: 'SVO Central',
      inicio_previsto: '2026-10-19T01:00:00',
      fim_previsto: null,
      data_hora_efetiva_saida: '2026-10-19T01:10:00',
      data_hora_efetiva_chegada: '2026-10-19T03:40:00',
      status: 'CONCLUIDA',
    });

    const blocos = projetarViagensNoDia([ordemConcluida], '2026-10-19');
    expect(blocos[0].horaInicioLabel).toBe('01:10');
    expect(blocos[0].horaFimLabel).toBe('03:40');
    expect(blocos[0].semPrevisaoFim).toBe(false);
  });

  it('agrupa toda a frota na lateral, inclusive veículos sem viagem no dia', () => {
    const veiculos: Veiculo[] = [
      {
        id: 1,
        placa: 'QRM-1020',
        modelo: 'Renault Master',
        tipo_frota: 'ADMINISTRATIVA',
        capacidade_maxima: 15,
        km_atual: 12000,
        status: 'RESERVADO',
      },
      {
        id: 2,
        placa: 'QRM-2030',
        modelo: 'Fiat Ducato',
        tipo_frota: 'SVO',
        capacidade_maxima: 2,
        km_atual: 45000,
        status: 'DISPONIVEL',
      },
    ];

    const blocos = projetarViagensNoDia([criarViagemBase({ veiculo_id: 1 })], '2026-10-19');
    const linhas = agruparRecursosAgenda(veiculos, blocos);

    expect(linhas).toHaveLength(2);
    expect(linhas[0].blocos).toHaveLength(1);
    expect(linhas[1].modelo).toBe('Fiat Ducato');
    expect(linhas[1].blocos).toHaveLength(0);
  });

  it('calcula dias da semana (segunda a domingo) e grade dinâmica do mês', () => {
    const semana = obterDiasSemana('2026-10-21', '2026-10-19');
    expect(semana[0].data).toBe('2026-10-19');
    expect(semana[0].ehHoje).toBe(true);
    expect(semana[6].data).toBe('2026-10-25');

    // Fevereiro de 2026 começa no domingo -> offset 6 (Seg..Sáb), 28 dias
    const gradeFev = obterGradeMes(2026, 1, [], '2026-02-10');
    expect(gradeFev.offsetInicial).toBe(6);
    expect(gradeFev.celulas).toHaveLength(28);
    expect(gradeFev.celulas[9].ehHoje).toBe(true);

    expect(adicionarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(adicionarMeses('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('oculta viagens canceladas, filtra frota para GESTOR_SVO e empilha ordens sobrepostas', () => {
    const cancelada = criarViagemBase({ id: 9, status: 'CANCELADA' });
    const svo1 = criarViagemBase({
      id: 1,
      tipo_operacao: 'SVO',
      origem: null,
      destino: 'HUSE',
      inicio_previsto: '2026-10-19T08:00:00',
      fim_previsto: null,
    });
    const svo2 = criarViagemBase({
      id: 2,
      tipo_operacao: 'SVO',
      origem: null,
      destino: 'Hospital Primavera',
      inicio_previsto: '2026-10-19T09:00:00',
      fim_previsto: null,
    });

    const blocos = projetarViagensNoDia([cancelada, svo1, svo2], '2026-10-19');
    expect(blocos).toHaveLength(2);

    const { blocosComFaixa, totalFaixas } = alocarSubfaixasBlocos(blocos);
    expect(totalFaixas).toBe(2);
    expect(blocosComFaixa[0].faixa).toBe(0);
    expect(blocosComFaixa[1].faixa).toBe(1);

    const frota: Veiculo[] = [
      {
        id: 1,
        placa: 'QRM-1020',
        modelo: 'Van Admin',
        tipo_frota: 'ADMINISTRATIVA',
        capacidade_maxima: 15,
        km_atual: 1000,
        status: 'DISPONIVEL',
      },
      {
        id: 2,
        placa: 'QRM-2030',
        modelo: 'Furgão SVO',
        tipo_frota: 'SVO',
        capacidade_maxima: 4,
        km_atual: 2000,
        status: 'DISPONIVEL',
      },
      {
        id: 3,
        placa: 'QRM-3040',
        modelo: 'Kombi Oficina',
        tipo_frota: 'SVO',
        capacidade_maxima: 2,
        km_atual: 3000,
        status: 'MANUTENCAO',
      },
    ];

    expect(filtrarVeiculosPorPerfil(frota, 'GESTOR_SVO')).toHaveLength(1);
    expect(filtrarVeiculosPorPerfil(frota, 'GESTOR_SVO')[0].id).toBe(2);
    expect(filtrarVeiculosPorPerfil(frota, 'GESTOR_FROTA')).toHaveLength(2);
    expect(filtrarVeiculosPorPerfil(frota, 'ADMINISTRADOR')).toHaveLength(2);
  });
});
