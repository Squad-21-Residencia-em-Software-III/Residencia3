
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERFIS } from '../constants/perfis';
import type { ReservaSvo } from '../services/agendaSvoService';

type Chamada = [metodo: string, argumentos: unknown[]];
type OrdemAgenda = Omit<ReservaSvo, 'status'> & { status: string };

interface Designacao {
  id: number;
  ordem_id: number;
  usuario_id: number;
  equipe_id: number;
  revogado_em: Date | null;
}

interface Estado {
  solicitacao?: object;
  solicitacaoSvo?: object;
  viagem?: object;
  viagemAtivaDaSolicitacao?: object;
  resultadosPrazo?: boolean[];
  ordemAtivaDaSolicitacao?: object;
  ordemPendente?: object;
  veiculo?: Record<string, unknown>;
  motorista?: Record<string, unknown>;
  cnhValida: boolean;
  conflito: { veiculo?: object; motorista?: object };
  ordensDaAgenda: OrdemAgenda[];
  designacoes: Designacao[];
  vinculos: { id: number; equipe_id: number; perfil: string; ativo: boolean; desvinculado_em: Date | null }[];
  equipe?: object;
  outrasViagens: Record<
    'veiculo_id' | 'motorista_id',
    { em_andamento: boolean; agendada: boolean }
  >;
  inserts: { tabela: string; valores: Record<string, unknown> }[];
  updates: { tabela: string; valores: Record<string, unknown> }[];
}

const { mockDb, mockTrx, ref } = vi.hoisted(() => {
  const trx = Object.assign(vi.fn(), { raw: vi.fn(), fn: { now: () => new Date('2099-01-01T00:00:00Z') } });

  return {
    mockTrx: trx,
    mockDb: {
      transaction: vi.fn(async (callback: Function) => callback(trx)),
    },
    ref: { estado: undefined as unknown as Estado },
  };
});

vi.mock('../config/database', () => ({
  db: mockDb,
}));
vi.mock('../services/filaSvoService', () => ({ reavaliarFilaSvo: vi.fn() }));
// O vínculo das fotos do odômetro tem testes próprios (evidenciaOdometroTransicao.test.ts)
vi.mock('../services/evidenciaOdometroTransicao', () => ({
  registrarEvidenciaNaTransicao: vi.fn(async () => undefined),
  concluirOperacao: vi.fn(async () => undefined),
}));

vi.mock('../models/veiculoModel', () => ({
  veiculoModel: { atualizarStatus: vi.fn() },
}));

vi.mock('../models/motoristaModel', () => ({
  motoristaModel: { atualizarStatus: vi.fn() },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { VIAGENS: 'VIAGENS' },
}));

vi.mock('../models/viagemModel', () => ({
  viagemModel: {
    listar: vi.fn().mockResolvedValue([]),
    listarAdministrativasDoSolicitante: vi.fn().mockResolvedValue({ dados: [], paginacao: {} }),
    buscarPorId: vi.fn(async (tipo: string, id: number) => ({
      id,
      tipo_operacao: tipo,
    })),
  },
}));

import { reavaliarFilaSvo } from '../services/filaSvoService';
import { registrarEvidenciaNaTransicao, concluirOperacao } from '../services/evidenciaOdometroTransicao';
import { viagemService } from '../services/viagemService';
import { veiculoModel } from '../models/veiculoModel';
import { motoristaModel } from '../models/motoristaModel';
import { auditoriaModel } from '../models/auditoriaModel';
import { viagemModel } from '../models/viagemModel';

describe('Consulta própria administrativa', () => {
  it('repassa ao modelo o ID autenticado e a paginação', async () => {
    await viagemService.listarMinhasAdministrativas({ id: 42, perfil: PERFIS.GESTOR_SVO }, 2, 10);
    expect(viagemModel.listarAdministrativasDoSolicitante).toHaveBeenCalledWith(42, 2, 10);
  });

  it('nega outros perfis mesmo se o serviço for chamado diretamente', async () => {
    await expect(viagemService.listarMinhasAdministrativas(
      { id: 42, perfil: PERFIS.GESTOR_FROTA }, 1, 20,
    )).rejects.toMatchObject({ statusCode: 403 });
  });
});

const temChamada = (
  chamadas: Chamada[],
  metodo: string,
  primeiroArgumento?: unknown
) =>
  chamadas.some(
    ([m, args]) =>
      m === metodo &&
      (primeiroArgumento === undefined ||
        args[0] === primeiroArgumento)
  );

function filtrarLinhas<T extends object>(linhas: T[], chamadas: Chamada[]): T[] {
  return linhas.filter((linha) => {
    const valor = (campo: unknown) => linha[campo as keyof T];
    const corresponde = ([metodo, [campo, criterio]]: Chamada): boolean => {
      switch (metodo) {
        case 'where':
        case 'orWhere':
          return typeof campo === 'string'
            ? valor(campo) === criterio
            : Object.entries(campo as object).every(([chave, esperado]) => valor(chave) === esperado);
        case 'whereNot':
          return !Object.entries(campo as object).every(([chave, esperado]) => valor(chave) === esperado);
        case 'whereIn':
        case 'orWhereIn':
          return (criterio as unknown[]).includes(valor(campo));
        case 'whereNull':
          return valor(campo) === null;
        case 'andWhere':
          return (campo as Chamada[]).some(corresponde);
        default:
          return true;
      }
    };
    return chamadas.every(corresponde);
  });
}

function responder(
  tabela: string,
  chamadas: Chamada[],
  terminal: 'first' | 'await'
) {
  const estado = ref.estado;

  if (temChamada(chamadas, 'insert')) {
    return [{ id: 99 }];
  }

  if (temChamada(chamadas, 'update')) {
    const [, [valores]] = chamadas.find(
      ([m]) => m === 'update'
    )!;

    estado.updates.push({
      tabela,
      valores: valores as Record<string, unknown>,
    });

    return 1;
  }

  switch (tabela) {
    case 'solicitacoes_viagem':
      if (temChamada(chamadas, 'where', 'data_saida_desejada')) {
        return estado.resultadosPrazo?.shift() ? estado.solicitacao : undefined;
      }
      return estado.solicitacao;

    case 'solicitacoes_svo':
      return estado.solicitacaoSvo;

    case 'equipes_svo':
      return estado.equipe;
    case 'ordens_svo_integrantes':
      return filtrarLinhas(estado.designacoes, chamadas);
    case 'equipes_svo_integrantes as v':
      return filtrarLinhas(estado.vinculos.map((vinculo) => ({
        'v.equipe_id': vinculo.equipe_id,
        'u.perfil': vinculo.perfil,
        'u.ativo': vinculo.ativo,
        'v.desvinculado_em': vinculo.desvinculado_em,
        'u.id': vinculo.id,
        id: vinculo.id,
      })), chamadas);

    case 'veiculos':
      return estado.veiculo;

    case 'motoristas': {
      if (temChamada(chamadas, 'where', 'validade_cnh')) {
        return estado.cnhValida
          ? { id: estado.motorista?.id }
          : undefined;
      }

      const filtro = chamadas.find(
        ([metodo, argumentos]) =>
          metodo === 'where' &&
          typeof argumentos[0] === 'object' &&
          argumentos[0] !== null &&
          'usuario_id' in argumentos[0]
      );

      if (filtro) {
        const criterios = filtro[1][0] as {
          id: number;
          usuario_id: number;
        };

        if (
          estado.motorista?.id !== criterios.id ||
          estado.motorista?.usuario_id !== criterios.usuario_id
        ) {
          return undefined;
        }
      }

      return estado.motorista;
    }

    case 'viagens_frota as vf':
      if (temChamada(chamadas, 'andWhere')) return estado.conflito.veiculo ?? estado.conflito.motorista;
      return temChamada(chamadas, 'where', 'vf.veiculo_id')
        ? estado.conflito.veiculo
        : estado.conflito.motorista;

    case 'viagens_frota':
      return temChamada(chamadas, 'forUpdate')
        ? estado.viagem
        : estado.viagemAtivaDaSolicitacao;

    case 'ordens_svo':
      if (terminal === 'await') return filtrarLinhas(estado.ordensDaAgenda, chamadas);
      if (chamadas.some(([m, args]) => m === 'where' && (args[0] as { status?: string })?.status === 'AGUARDANDO_ALOCACAO')) {
        return estado.ordemPendente;
      }
      if (temChamada(chamadas, 'forUpdate')) return estado.viagem ?? estado.ordemPendente;
      return estado.ordemAtivaDaSolicitacao;

    default:
      return undefined;
  }
}

function criarConsulta(tabela: string, chamadas: Chamada[] = []) {
  const consulta: Record<string, any> = {};

  for (const metodo of [
    'where',
    'whereIn',
    'whereNot',
    'orWhere',
    'orWhereIn',
    'whereNull',
    'orWhereNull',
    'orderBy',
    'whereRaw',
    'join',
    'select',
    'forUpdate',
    'insert',
    'returning',
    'update',
  ]) {
    consulta[metodo] = (...argumentos: unknown[]) => {
      chamadas.push([metodo, argumentos]);
      return consulta;
    };
  }
  consulta.modify = (callback: (q: unknown) => void) => { callback(consulta); return consulta; };
  consulta.andWhere = (callback: (q: unknown) => void) => {
    const grupo: Chamada[] = [];
    callback(criarConsulta(tabela, grupo));
    chamadas.push(['andWhere', [grupo]]);
    return consulta;
  };

  consulta.first = async () =>
    responder(tabela, chamadas, 'first');

  consulta.then = (resolve: Function, reject: Function) =>
    Promise.resolve(
      responder(tabela, chamadas, 'await')
    ).then(resolve as any, reject as any);

  return consulta;
}

function situacao(sql: string) {
  const estado = ref.estado;

  const coluna = sql.includes('motorista_id')
    ? 'motorista_id'
    : 'veiculo_id';

  const statusAtual =
    estado.updates
      .filter((u) =>
        ['viagens_frota', 'ordens_svo'].includes(u.tabela)
      )
      .at(-1)?.valores.status ??
    (estado.inserts.length
      ? 'AGENDADA'
      : (estado.viagem as { status?: string } | undefined)
          ?.status);

  return {
    rows: [
      {
        em_andamento:
          estado.outrasViagens[coluna].em_andamento ||
          ['EM_ANDAMENTO', 'EM_DESLOCAMENTO', 'NO_LOCAL'].includes(
            String(statusAtual)
          ),

        agendada:
          estado.outrasViagens[coluna].agendada ||
          ['AGENDADA', 'ALOCADA'].includes(
            String(statusAtual)
          ),
      },
    ],
  };
}

const gestorFrota = {
  id: 3,
  perfil: PERFIS.GESTOR_FROTA,
};

const gestorSvo = {
  id: 4,
  perfil: PERFIS.GESTOR_SVO,
};

const motoristaFrota = {
  id: 30,
  perfil: PERFIS.MOTORISTA_FROTA,
};

const motoristaSvo = {
  id: 30,
  perfil: PERFIS.MOTORISTA_SVO,
};

beforeEach(() => {
  vi.clearAllMocks();

  ref.estado = {
    solicitacao: {
      id: 1,
      solicitante_id: 40,
      unidade_id: 3,
      status: 'APROVADA',
      destino: 'Itabaiana',
      data_saida_desejada: '2026-11-10T08:00:00',
      data_chegada_desejada: '2026-11-10T17:00:00',
    },

    solicitacaoSvo: {
      id: 7,
      status: 'EM_TRIAGEM',
      local_ocorrencia: 'Rua A, 100',
    },

    veiculo: {
      id: 10,
      tipo_frota: 'ADMINISTRATIVA',
      status: 'DISPONIVEL',
      km_atual: 1000,
      capacidade_maxima: 4,
    },

    motorista: {
      id: 20,
      usuario_id: 30,
      tipo_motorista: 'FROTA',
      status: 'DISPONIVEL',
    },

    cnhValida: true,
    conflito: {},
    ordensDaAgenda: [],
    designacoes: [],
    vinculos: [],
    equipe: { id: 2 },

    outrasViagens: {
      veiculo_id: {
        em_andamento: false,
        agendada: false,
      },
      motorista_id: {
        em_andamento: false,
        agendada: false,
      },
    },

    inserts: [],
    updates: [],
  };

  mockTrx.mockImplementation((tabela: string) => {
    const consulta = criarConsulta(tabela);
    const insert = consulta.insert;

    consulta.insert = (
      valores: Record<string, unknown>
    ) => {
      ref.estado.inserts.push({ tabela, valores });
      return insert(valores);
    };

    return consulta;
  });

  mockTrx.raw.mockImplementation((sql: string) =>
    sql.includes('bool_or')
      ? Promise.resolve(situacao(sql))
      : sql
  );
});

describe('viagemService.listar', () => {
  it('deve listar apenas o tipo de viagem do perfil', async () => {
    await viagemService.listar({
      id: 1,
      perfil: PERFIS.GESTOR_FROTA,
    });

    expect(viagemModel.listar).toHaveBeenCalledWith([
      'ADMINISTRATIVA',
    ]);

    await viagemService.listar({
      id: 1,
      perfil: PERFIS.ADMINISTRADOR,
    });

    expect(viagemModel.listar).toHaveBeenCalledWith([
      'ADMINISTRATIVA',
      'SVO',
    ]);
  });

  it('deve filtrar viagens administrativas pelo motorista autenticado', async () => {
    await viagemService.listar(motoristaFrota);

    expect(viagemModel.listar).toHaveBeenCalledWith(
      ['ADMINISTRATIVA'],
      30
    );
  });

  it('deve filtrar ordens SVO pelo motorista autenticado', async () => {
    await viagemService.listar(motoristaSvo);

    expect(viagemModel.listar).toHaveBeenCalledWith(
      ['SVO'],
      30
    );
  });

  it('deve manter a consulta do gestor SVO sem filtro de motorista', async () => {
    await viagemService.listar(gestorSvo);

    expect(viagemModel.listar).toHaveBeenCalledWith([
      'SVO',
    ]);
  });
});

describe('viagemService.criar (administrativa)', () => {
  const dados = {
    tipo_operacao: 'ADMINISTRATIVA' as const,
    solicitacao_id: 1,
    veiculo_id: 10,
    motorista_id: 20,
  };

  it('deve impedir o gestor SVO de criar viagem administrativa', async () => {
    await expect(
      viagemService.criar(dados, gestorSvo)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('deve rejeitar solicitação inexistente', async () => {
    ref.estado.solicitacao = undefined;

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve rejeitar solicitação que não está aprovada', async () => {
    ref.estado.solicitacao = {
      ...ref.estado.solicitacao,
      status: 'PENDENTE_APROVACAO',
    };

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Apenas solicitações aprovadas podem ser agendadas',
    });
  });

  it('deve rejeitar solicitação que já tem viagem ativa', async () => {
    ref.estado.viagemAtivaDaSolicitacao = { id: 5 };

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deve rejeitar veículo da frota SVO', async () => {
    ref.estado.veiculo = {
      ...ref.estado.veiculo,
      tipo_frota: 'SVO',
    };

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve rejeitar veículo em manutenção', async () => {
    ref.estado.veiculo = {
      ...ref.estado.veiculo,
      status: 'MANUTENCAO',
    };

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve rejeitar veículo com viagem no mesmo período', async () => {
    ref.estado.conflito.veiculo = { id: 5 };

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deve rejeitar motorista do SVO', async () => {
    ref.estado.motorista = {
      ...ref.estado.motorista,
      tipo_motorista: 'SVO',
    };

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve rejeitar motorista com CNH vencida', async () => {
    ref.estado.cnhValida = false;

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve rejeitar motorista com viagem no mesmo período', async () => {
    ref.estado.conflito.motorista = { id: 5 };

    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejeita se o prazo venceu enquanto a transação aguardava os recursos', async () => {
    ref.estado.resultadosPrazo = [false, true];
    await expect(viagemService.criar(dados, gestorFrota)).rejects.toMatchObject({
      statusCode: 409, codigo: 'SOLICITACAO_EXPIRADA',
    });
    expect(ref.estado.inserts).toEqual([]);
  });

  it('deve agendar, reservar os recursos e auditar no módulo de viagens', async () => {
    await expect(
      viagemService.criar(dados, gestorFrota)
    ).resolves.toEqual({
      id: 99,
      tipo_operacao: 'ADMINISTRATIVA',
    });

    expect(ref.estado.inserts).toContainEqual({
      tabela: 'viagens_frota',
      valores: expect.objectContaining({
        status: 'AGENDADA',
      }),
    });

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(
      10,
      'RESERVADO',
      mockTrx
    );

    expect(motoristaModel.atualizarStatus).toHaveBeenCalledWith(
      20,
      'DESIGNADO',
      mockTrx
    );

    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        modulo: 'VIAGENS',
      }),
      mockTrx
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_viagem',
      valores: { status: 'AGENDADA' },
    });
  });

  it('não deve sobrescrever o status de recursos em outra viagem em andamento', async () => {
    ref.estado.outrasViagens.veiculo_id.em_andamento = true;
    ref.estado.outrasViagens.motorista_id.em_andamento = true;

    await viagemService.criar(dados, gestorFrota);

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(
      10,
      'EM_USO',
      mockTrx
    );

    expect(motoristaModel.atualizarStatus).toHaveBeenCalledWith(
      20,
      'EM_VIAGEM',
      mockTrx
    );
  });
});

describe('viagemService.criar (SVO)', () => {
  const dados = {
    tipo_operacao: 'SVO' as const,
    solicitacao_id: 7,
    veiculo_id: 10,
    motorista_id: 20,
    equipe_id: 2,
    integrantes_ids: [40],
    inicio_previsto: '2099-11-20T16:00:00Z',
    fim_previsto: '2099-11-20T18:00:00Z',
    capacidade_utilizada: 2,
  };
  const reserva: OrdemAgenda = {
    id: 3,
    status: 'ALOCADA',
    veiculo_id: 11,
    motorista_id: 21,
    equipe_id: 2,
    inicio_previsto: '2099-11-20T15:00:00Z',
    fim_previsto: '2099-11-20T17:00:00Z',
  };
  const designacao: Designacao = {
    id: 1, ordem_id: 3, equipe_id: 9, usuario_id: 40, revogado_em: null,
  };

  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    ref.estado.veiculo = { ...ref.estado.veiculo, tipo_frota: 'SVO', lotacao_cabine: 2 };
    ref.estado.motorista = { ...ref.estado.motorista, tipo_motorista: 'SVO' };
    ref.estado.solicitacaoSvo = { id: 7, status: 'CONFIRMADA' };
    ref.estado.ordemPendente = { id: 99, data_hora_saida: null };
    ref.estado.vinculos = [{
      id: 40, equipe_id: 2, perfil: PERFIS.INTEGRANTE_SVO, ativo: true, desvinculado_em: null,
    }];
  });

  it('deve impedir o gestor de frota de alocar ordem SVO', async () => {
    await expect(viagemService.criar(dados, gestorFrota)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('deve rejeitar solicitação SVO concluída', async () => {
    ref.estado.solicitacaoSvo = { id: 7, status: 'CONCLUIDA' };
    await expect(viagemService.criar(dados, gestorSvo)).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each(['EM_TRIAGEM', 'EM_ANDAMENTO', 'CANCELADA'])('deve rejeitar alocação de solicitação %s', async (status) => {
    ref.estado.solicitacaoSvo = { id: 7, status };
    await expect(viagemService.criar(dados, gestorSvo)).rejects.toMatchObject({ statusCode: 409 });
    expect(ref.estado.inserts).toEqual([]);
    expect(ref.estado.updates).toEqual([]);
  });

  it('deve rejeitar solicitação confirmada sem ordem pendente', async () => {
    ref.estado.ordemPendente = undefined;
    await expect(viagemService.criar(dados, gestorSvo)).rejects.toMatchObject({ statusCode: 409 });
    expect(ref.estado.inserts).toEqual([]);
  });

  it.each([
    { tipo_frota: 'ADMINISTRATIVA', status: 'DISPONIVEL', mensagem: 'O veículo não pertence à frota SVO' },
    { tipo_frota: 'SVO', status: 'MANUTENCAO', mensagem: 'O veículo está em manutenção' },
  ])('deve rejeitar veículo da frota $tipo_frota com status $status', async ({ tipo_frota, status, mensagem }) => {
    ref.estado.veiculo = { ...ref.estado.veiculo, tipo_frota, status };

    await expect(viagemService.criar(dados, gestorSvo)).rejects.toMatchObject({ statusCode: 400, message: mensagem });
    expect(ref.estado.inserts).toEqual([]);
    expect(ref.estado.updates).toEqual([]);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it.each([1, 2, 4])('deve aceitar %i óbito(s) no limite do veículo com um integrante designado', async (capacidade) => {
    ref.estado.veiculo = { ...ref.estado.veiculo, capacidade_maxima: capacidade };

    await expect(viagemService.criar({ ...dados, capacidade_utilizada: capacidade }, gestorSvo))
      .resolves.toEqual({ id: 99, tipo_operacao: 'SVO' });
    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({ capacidade_utilizada: capacidade, status: 'ALOCADA' }),
    });
    expect(ref.estado.inserts).toEqual([{
      tabela: 'ordens_svo_integrantes',
      valores: expect.objectContaining({ ordem_id: 99, usuario_id: 40 }),
    }]);
  });

  it.each([
    { capacidadeMaxima: 1, capacidadeUtilizada: 2 },
    { capacidadeMaxima: 2, capacidadeUtilizada: 3 },
    { capacidadeMaxima: 5, capacidadeUtilizada: 5 },
  ])('deve rejeitar capacidade utilizada $capacidadeUtilizada em veículo com capacidade $capacidadeMaxima',
    async ({ capacidadeMaxima, capacidadeUtilizada }) => {
      ref.estado.veiculo = { ...ref.estado.veiculo, capacidade_maxima: capacidadeMaxima };

      await expect(viagemService.criar({ ...dados, capacidade_utilizada: capacidadeUtilizada }, gestorSvo))
        .rejects.toMatchObject({ statusCode: 409, message: 'O veículo não tem capacidade suficiente' });
      expect(ref.estado.inserts).toEqual([]);
      expect(ref.estado.updates).toEqual([]);
      expect(auditoriaModel.registrar).not.toHaveBeenCalled();
      expect(reavaliarFilaSvo).not.toHaveBeenCalled();
    },
  );

  it.each([
    { statusOrdem: 'ALOCADA', statusVeiculo: 'RESERVADO', agora: '2099-11-20T12:00:00Z' },
    { statusOrdem: 'EM_DESLOCAMENTO', statusVeiculo: 'EM_USO', agora: '2099-11-20T13:30:00Z' },
  ])('deve reservar veículo $statusVeiculo para outro motorista em período distinto', async ({ statusOrdem, statusVeiculo, agora }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(agora));
    ref.estado.veiculo = { ...ref.estado.veiculo, status: statusVeiculo };
    const coletaAnterior = {
      ...reserva, status: statusOrdem, veiculo_id: 10, equipe_id: 9, capacidade_utilizada: 3,
      inicio_previsto: '2099-11-20T13:00:00Z', fim_previsto: '2099-11-20T14:00:00Z',
    };
    ref.estado.ordensDaAgenda = [coletaAnterior];

    await expect(viagemService.criar({ ...dados, capacidade_utilizada: 3 }, gestorSvo))
      .resolves.toEqual({ id: 99, tipo_operacao: 'SVO' });
    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        veiculo_id: 10, motorista_id: 20, capacidade_utilizada: 3, status: 'ALOCADA', liberada_em: null,
        inicio_previsto: new Date(dados.inicio_previsto), fim_previsto: new Date(dados.fim_previsto),
      }),
    });
  });

  it.each([
    { recurso: 'veículo alocado a outro motorista', ordem: { veiculo_id: 10 } },
    { recurso: 'veículo em deslocamento', ordem: { veiculo_id: 10, status: 'EM_DESLOCAMENTO' } },
    { recurso: 'motorista alocado em outro veículo', ordem: { motorista_id: 20 } },
  ])('deve rejeitar sobreposição por $recurso', async ({ ordem }) => {
    ref.estado.ordensDaAgenda = [{ ...reserva, equipe_id: 9, ...ordem }];

    await expect(viagemService.criar(dados, gestorSvo))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'CONFLITO_AGENDA' });
    expect(ref.estado.updates).toEqual([]);
    expect(ref.estado.inserts).toEqual([]);
  });

  it('deve rejeitar equipe inexistente', async () => {
    ref.estado.equipe = undefined;

    await expect(viagemService.criar(dados, gestorSvo)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve rejeitar equipe já reservada em outra coleta, mesmo com veículo e motorista diferentes', async () => {
    ref.estado.ordensDaAgenda = [reserva];

    await expect(viagemService.criar(dados, gestorSvo))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'CONFLITO_AGENDA' });
    expect(ref.estado.updates).toEqual([]);
    expect(ref.estado.inserts).toEqual([]);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
    expect(reavaliarFilaSvo).not.toHaveBeenCalled();
  });

  it('deve alocar equipe sem escala quando a reserva sobreposta é de outra equipe com recursos distintos', async () => {
    ref.estado.ordensDaAgenda = [{ ...reserva, equipe_id: 9 }];

    await expect(viagemService.criar(dados, gestorSvo)).resolves.toEqual({ id: 99, tipo_operacao: 'SVO' });
    expect(mockTrx).not.toHaveBeenCalledWith('escalas_svo');
    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({ status: 'ALOCADA', equipe_id: 2, veiculo_id: 10, motorista_id: 20 }),
    });
    expect(ref.estado.inserts).toEqual([{
      tabela: 'ordens_svo_integrantes',
      valores: expect.objectContaining({ ordem_id: 99, equipe_id: 2, usuario_id: 40 }),
    }]);
  });

  it.each([
    { caso: 'reserva da mesma equipe fora do período', ordem: { inicio_previsto: '2099-11-20T19:00:00Z', fim_previsto: '2099-11-20T21:00:00Z' } },
    { caso: 'coleta da mesma equipe já concluída', ordem: { status: 'CONCLUIDA' } },
  ])('deve alocar a equipe com $caso', async ({ ordem }) => {
    ref.estado.ordensDaAgenda = [{ ...reserva, ...ordem }];

    await expect(viagemService.criar(dados, gestorSvo)).resolves.toEqual({ id: 99, tipo_operacao: 'SVO' });
    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({ status: 'ALOCADA', equipe_id: 2 }),
    });
  });

  it('deve rejeitar integrante reservado em outra coleta com equipe, veículo e motorista distintos', async () => {
    ref.estado.ordensDaAgenda = [{ ...reserva, equipe_id: 9 }];
    ref.estado.designacoes = [designacao];

    await expect(viagemService.criar(dados, gestorSvo))
      .rejects.toMatchObject({ statusCode: 409, codigo: 'CONFLITO_AGENDA' });
    expect(ref.estado.updates).toEqual([]);
    expect(ref.estado.inserts).toEqual([]);
  });

  it('deve reprogramar a ordem sem conflito com a própria reserva e preservar sua designação', async () => {
    const atual = { ...reserva, id: 99, solicitacao_id: 7, veiculo_id: 10, motorista_id: 20 };
    ref.estado.solicitacaoSvo = { id: 7, status: 'EM_ANDAMENTO' };
    ref.estado.viagem = atual;
    ref.estado.ordensDaAgenda = [atual];
    ref.estado.designacoes = [{ ...designacao, ordem_id: 99, equipe_id: 2 }];

    await expect(viagemService.reprogramarOrdemSvo(99, { ...dados, integrantes_ids: undefined }, gestorSvo))
      .resolves.toEqual({ id: 99, tipo_operacao: 'SVO' });
    expect(ref.estado.inserts).toEqual([]);
    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'ALOCADA', equipe_id: 2, inicio_previsto: new Date(dados.inicio_previsto),
        fim_previsto: new Date(dados.fim_previsto),
      }),
    });
    expect(ref.estado.updates.some(({ tabela }) => tabela === 'ordens_svo_integrantes')).toBe(false);
  });

  it('deve alocar sem equipe a ordem existente com a capacidade informada sem criar outra', async () => {
    await expect(viagemService.criar({ ...dados, equipe_id: null, integrantes_ids: undefined }, gestorSvo))
      .resolves.toEqual({ id: 99, tipo_operacao: 'SVO' });
    expect(ref.estado.inserts).toEqual([]);
    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'ALOCADA',
        capacidade_utilizada: 2,
        equipe_id: null,
      }),
    });

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(
      10,
      'RESERVADO',
      mockTrx
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'EM_ANDAMENTO' },
    });
  });
});

describe('viagemService.iniciarViagem', () => {
  beforeEach(() => {
    ref.estado.viagem = {
      id: 5,
      status: 'AGENDADA',
      veiculo_id: 10,
      motorista_id: 20,
    };
  });

  it('impede gestor de iniciar coleta SVO', async () => {
    await expect(viagemService.iniciarViagem('SVO', 5, 1000, gestorSvo)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('deve rejeitar viagem que não está agendada', async () => {
    ref.estado.viagem = {
      id: 5,
      status: 'CONCLUIDA',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await expect(
      viagemService.iniciarViagem(
        'ADMINISTRATIVA',
        5,
        1000,
        gestorFrota
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each([undefined, null, '', '   '])('deve bloquear a saída sem destino (%j)', async (destino) => {
    ref.estado.solicitacao = { ...ref.estado.solicitacao, destino };

    await expect(viagemService.iniciarViagem('ADMINISTRATIVA', 5, 1000, gestorFrota)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Informe o destino antes de registrar a saída do veículo',
    });
    expect(ref.estado.updates).toEqual([]);
    expect(veiculoModel.atualizarStatus).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('deve bloquear a saída de ordem SVO sem local de ocorrência', async () => {
    ref.estado.viagem = { id: 5, status: 'ALOCADA', veiculo_id: 10, motorista_id: 20 };
    ref.estado.solicitacaoSvo = { id: 7, status: 'EM_ANDAMENTO', local_ocorrencia: ' ' };

    await expect(viagemService.iniciarViagem('SVO', 5, 1000, motoristaSvo)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(ref.estado.updates).toEqual([]);
  });

  it('deve rejeitar km inicial menor que o km atual do veículo', async () => {
    await expect(
      viagemService.iniciarViagem(
        'ADMINISTRATIVA',
        5,
        999,
        gestorFrota
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        'O km inicial não pode ser menor que o km atual do veículo (1000)',
    });
  });

  it('deve rejeitar veículo em outra viagem em andamento', async () => {
    ref.estado.outrasViagens.veiculo_id.em_andamento = true;

    await expect(
      viagemService.iniciarViagem(
        'ADMINISTRATIVA',
        5,
        1000,
        gestorFrota
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deve iniciar a viagem e marcar veículo e motorista em uso', async () => {
    await viagemService.iniciarViagem(
      'ADMINISTRATIVA',
      5,
      1000,
      gestorFrota
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'viagens_frota',
      valores: expect.objectContaining({
        status: 'EM_ANDAMENTO',
        km_inicial: 1000,
        data_hora_efetiva_saida: expect.any(Date),
      }),
    });

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(
      10,
      'EM_USO',
      mockTrx
    );

    expect(motoristaModel.atualizarStatus).toHaveBeenCalledWith(
      20,
      'EM_VIAGEM',
      mockTrx
    );
  });

  it('deve iniciar ordem SVO em deslocamento', async () => {
    ref.estado.viagem = {
      id: 5,
      status: 'ALOCADA',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.iniciarViagem(
      'SVO',
      5,
      1000,
      motoristaSvo
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'EM_DESLOCAMENTO',
        km_inicial: 1000,
        data_hora_saida: expect.any(Date),
      }),
    });
  });

  it('deve permitir motorista da frota iniciar sua própria viagem', async () => {
    await expect(
      viagemService.iniciarViagem(
        'ADMINISTRATIVA',
        5,
        1000,
        motoristaFrota
      )
    ).resolves.toEqual({
      id: 5,
      tipo_operacao: 'ADMINISTRATIVA',
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'viagens_frota',
      valores: expect.objectContaining({
        status: 'EM_ANDAMENTO',
        km_inicial: 1000,
      }),
    });

    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario_id: 30 }),
      mockTrx
    );
  });

  it('deve permitir motorista SVO iniciar sua própria ordem', async () => {
    ref.estado.viagem = {
      id: 5,
      status: 'ALOCADA',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await expect(
      viagemService.iniciarViagem(
        'SVO',
        5,
        1000,
        motoristaSvo
      )
    ).resolves.toEqual({
      id: 5,
      tipo_operacao: 'SVO',
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'EM_DESLOCAMENTO',
        km_inicial: 1000,
      }),
    });
  });

  it('deve impedir motorista de iniciar viagem de outro motorista', async () => {
    const outroMotorista = {
      id: 99,
      perfil: PERFIS.MOTORISTA_FROTA,
    };

    await expect(
      viagemService.iniciarViagem(
        'ADMINISTRATIVA',
        5,
        1000,
        outroMotorista
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(ref.estado.updates).toHaveLength(0);
  });
});

describe('viagemService.finalizarViagem', () => {
  it('impede gestor de finalizar coleta SVO', async () => {
    await expect(viagemService.finalizarViagem('SVO', 5, 1000, gestorSvo)).rejects.toMatchObject({ statusCode: 403 });
  });
  beforeEach(() => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 1,
      status: 'EM_ANDAMENTO',
      km_inicial: 1000,
      veiculo_id: 10,
      motorista_id: 20,
    };
  });

  it('deve impedir motorista de finalizar viagem de outro motorista', async () => {
    const outroMotorista = {
      id: 99,
      perfil: PERFIS.MOTORISTA_FROTA,
    };

    await expect(
      viagemService.finalizarViagem(
        'ADMINISTRATIVA',
        5,
        1050,
        outroMotorista
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(ref.estado.updates).toHaveLength(0);
  });

  // BL17: a API valida a quilometragem final, sem depender da interface
  it.each([
    ['ADMINISTRATIVA', 'EM_ANDAMENTO', () => gestorFrota],
    ['SVO', 'EM_DESLOCAMENTO', () => motoristaSvo],
  ] as const)('deve rejeitar km final menor que o km inicial (%s) sem gravar nada', async (tipo, status, autor) => {
    ref.estado.viagem = { ...ref.estado.viagem, status };

    await expect(viagemService.finalizarViagem(tipo, 5, 999, autor())).rejects.toMatchObject({
      statusCode: 400,
      message: 'O km final não pode ser menor que o km inicial (1000)',
    });
    expect(ref.estado.updates).toHaveLength(0);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('deve permitir km final igual ao km inicial', async () => {
    await viagemService.finalizarViagem('ADMINISTRATIVA', 5, 1000, gestorFrota);

    expect(ref.estado.updates).toContainEqual({
      tabela: 'viagens_frota',
      valores: expect.objectContaining({ status: 'CONCLUIDA', km_final: 1000 }),
    });
  });

  it.each([null, undefined])('deve rejeitar a finalização quando o km inicial é %s', async (kmInicial) => {
    ref.estado.viagem = { ...ref.estado.viagem, km_inicial: kmInicial };

    await expect(viagemService.finalizarViagem('ADMINISTRATIVA', 5, 1050, gestorFrota)).rejects.toMatchObject({
      statusCode: 409,
      message: 'A viagem não possui km inicial registrado',
    });
    expect(ref.estado.updates).toHaveLength(0);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('deve concluir, atualizar o km do veículo e liberar os recursos', async () => {
    await viagemService.finalizarViagem(
      'ADMINISTRATIVA',
      5,
      1050,
      gestorFrota
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'viagens_frota',
      valores: expect.objectContaining({
        status: 'CONCLUIDA',
        km_final: 1050,
      }),
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_viagem',
      valores: { status: 'CONCLUIDA' },
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'veiculos',
      valores: {
        km_atual: 'GREATEST(km_atual, ?)',
      },
    });

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(
      10,
      'DISPONIVEL',
      mockTrx
    );

    expect(motoristaModel.atualizarStatus).toHaveBeenCalledWith(
      20,
      'DISPONIVEL',
      mockTrx
    );
  });

  it('deve manter o veículo reservado se houver outra viagem agendada', async () => {
    ref.estado.outrasViagens.veiculo_id.agendada = true;

    await viagemService.finalizarViagem(
      'ADMINISTRATIVA',
      5,
      1050,
      gestorFrota
    );

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(
      10,
      'RESERVADO',
      mockTrx
    );
  });

  it.each(['EM_DESLOCAMENTO', 'NO_LOCAL'])('deve concluir a solicitação SVO junto com a ordem em %s', async (status) => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 7,
      status,
      km_inicial: 1000,
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.finalizarViagem(
      'SVO',
      5,
      1050,
      motoristaSvo
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'CONCLUIDA',
        data_hora_conclusao: expect.any(Date),
      }),
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'CONCLUIDA' },
    });
  });

  it('deve permitir motorista da frota finalizar sua própria viagem', async () => {
    await expect(
      viagemService.finalizarViagem(
        'ADMINISTRATIVA',
        5,
        1050,
        motoristaFrota
      )
    ).resolves.toEqual({
      id: 5,
      tipo_operacao: 'ADMINISTRATIVA',
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'viagens_frota',
      valores: expect.objectContaining({
        status: 'CONCLUIDA',
        km_final: 1050,
      }),
    });

    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario_id: 30 }),
      mockTrx
    );
  });

  it('deve permitir motorista SVO finalizar sua própria ordem', async () => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 7,
      status: 'EM_DESLOCAMENTO',
      km_inicial: 1000,
      veiculo_id: 10,
      motorista_id: 20,
    };

    await expect(
      viagemService.finalizarViagem(
        'SVO',
        5,
        1050,
        motoristaSvo
      )
    ).resolves.toEqual({
      id: 5,
      tipo_operacao: 'SVO',
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'CONCLUIDA',
        km_final: 1050,
      }),
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'CONCLUIDA' },
    });
  });
});

describe('viagemService.cancelarViagem', () => {
  it('deve rejeitar viagem em andamento', async () => {
    ref.estado.viagem = {
      id: 5,
      status: 'EM_ANDAMENTO',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await expect(
      viagemService.cancelarViagem(
        'ADMINISTRATIVA',
        5,
        gestorFrota
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve rejeitar viagem inexistente', async () => {
    ref.estado.viagem = undefined;

    await expect(
      viagemService.cancelarViagem(
        'ADMINISTRATIVA',
        5,
        gestorFrota
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve cancelar, liberar os recursos e manter a solicitação aprovada', async () => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 1,
      status: 'AGENDADA',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.cancelarViagem(
      'ADMINISTRATIVA',
      5,
      gestorFrota
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'viagens_frota',
      valores: { status: 'CANCELADA' },
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_viagem',
      valores: { status: 'APROVADA' },
    });

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(
      10,
      'DISPONIVEL',
      mockTrx
    );

    expect(motoristaModel.atualizarStatus).toHaveBeenCalledWith(
      20,
      'DISPONIVEL',
      mockTrx
    );
  });

  it('deve cancelar também a solicitação quando pedido', async () => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 1,
      status: 'AGENDADA',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.cancelarViagem(
      'ADMINISTRATIVA',
      5,
      gestorFrota,
      true
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_viagem',
      valores: { status: 'CANCELADA' },
    });
  });

  it('deve devolver a solicitação SVO para triagem ao cancelar a ordem e limpar a confirmação', async () => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 7,
      status: 'ALOCADA',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.cancelarViagem(
      'SVO',
      5,
      gestorSvo
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: { status: 'CANCELADA' },
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'EM_TRIAGEM', confirmado_por: null, confirmado_em: null },
    });
  });

  it('deve cancelar ordem SVO aguardando alocação e devolver a solicitação à triagem', async () => {
    ref.estado.viagem = {
      id: 6,
      solicitacao_id: 7,
      status: 'AGUARDANDO_ALOCACAO',
      veiculo_id: null,
      motorista_id: null,
    };

    await viagemService.cancelarViagem('SVO', 6, gestorSvo);

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: { status: 'CANCELADA' },
    });
    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'EM_TRIAGEM', confirmado_por: null, confirmado_em: null },
    });
    // Sem veículo nem motorista, nada a liberar
    expect(ref.estado.updates.some((u) => u.tabela === 'veiculos' || u.tabela === 'motoristas')).toBe(false);
  });

  it('deve cancelar ordem SVO aguardando alocação junto com a solicitação', async () => {
    ref.estado.viagem = {
      id: 6,
      solicitacao_id: 7,
      status: 'AGUARDANDO_ALOCACAO',
      veiculo_id: null,
      motorista_id: null,
    };

    await viagemService.cancelarViagem('SVO', 6, gestorSvo, true);

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'CANCELADA' },
    });
  });

  it('não deve cancelar ordem SVO em deslocamento', async () => {
    ref.estado.viagem = {
      id: 6,
      solicitacao_id: 7,
      status: 'EM_DESLOCAMENTO',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await expect(viagemService.cancelarViagem('SVO', 6, gestorSvo)).rejects.toMatchObject({ statusCode: 400 });
    expect(ref.estado.updates).toEqual([]);
  });

  it('deve manter a confirmação quando a solicitação SVO também é cancelada', async () => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 7,
      status: 'ALOCADA',
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.cancelarViagem('SVO', 5, gestorSvo, true);

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'CANCELADA' },
    });
  });
});

describe('BL31 - registrarChegadaLocalSvo', () => {
  beforeEach(() => {
    ref.estado.viagem = {
      id: 5,
      status: 'EM_DESLOCAMENTO',
      veiculo_id: 10,
      motorista_id: 20,
    };
  });

  it('deve permitir que o motorista SVO registre a chegada ao local', async () => {
    await viagemService.registrarChegadaLocalSvo(5, motoristaSvo);

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: { status: 'NO_LOCAL' },
    });

    expect(auditoriaModel.registrar).toHaveBeenCalled();
  });

  it('BL31 - deve finalizar uma coleta SVO com status NO_LOCAL', async () => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 7,
      status: 'NO_LOCAL',
      km_inicial: 1000,
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.finalizarViagem(
      'SVO',
      5,
      1050,
      motoristaSvo
    );

    expect(ref.estado.updates).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'CONCLUIDA',
        data_hora_conclusao: expect.any(Date),
      }),
    });

    expect(ref.estado.updates).toContainEqual({
      tabela: 'solicitacoes_svo',
      valores: { status: 'CONCLUIDA' },
    });
  });

  it.each(['ALOCADA', 'NO_LOCAL', 'CONCLUIDA', 'CANCELADA'])('rejeita chegada com status %s sem mutação', async (status) => {
    ref.estado.viagem = {
      id: 5,
      status,
      veiculo_id: 10,
      motorista_id: 20,
    };

    await expect(
      viagemService.registrarChegadaLocalSvo(5, motoristaSvo)
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(ref.estado.updates).toHaveLength(0);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('deve impedir motorista SVO de registrar chegada de outro motorista', async () => {
    const outroMotorista = {
      id: 99,
      perfil: PERFIS.MOTORISTA_SVO,
    };

    await expect(
      viagemService.registrarChegadaLocalSvo(5, outroMotorista)
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(ref.estado.updates).toHaveLength(0);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });
});


describe('autorização operacional SVO independente da interface', () => {
  it.each([PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO, PERFIS.GESTOR_FROTA,
    PERFIS.MOTORISTA_FROTA, PERFIS.SOLICITANTE])('nega todas as transições ao perfil %s sem efeitos', async (perfil) => {
    const autor = { id: 30, perfil };
    for (const operacao of [
      () => viagemService.iniciarViagem('SVO', 5, 1000, autor),
      () => viagemService.registrarChegadaLocalSvo(5, autor),
      () => viagemService.finalizarViagem('SVO', 5, 1050, autor),
    ]) await expect(operacao()).rejects.toMatchObject({ statusCode: 403 });
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(ref.estado.updates).toEqual([]);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
    expect(veiculoModel.atualizarStatus).not.toHaveBeenCalled();
    expect(motoristaModel.atualizarStatus).not.toHaveBeenCalled();
  });
  it.each(['iniciar', 'finalizar'] as const)('nega %s a outro motorista sem tocar evidências ou fila', async (acao) => {
    ref.estado.viagem = { id: 5, motorista_id: 20, veiculo_id: 10,
      status: acao === 'iniciar' ? 'ALOCADA' : 'NO_LOCAL', km_inicial: 1000 };
    const outro = { id: 99, perfil: PERFIS.MOTORISTA_SVO };
    await expect(acao === 'iniciar' ? viagemService.iniciarViagem('SVO', 5, 1000, outro)
      : viagemService.finalizarViagem('SVO', 5, 1050, outro)).rejects.toMatchObject({ statusCode: 403 });
    expect(ref.estado.updates).toEqual([]);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
    expect(reavaliarFilaSvo).not.toHaveBeenCalled();
    expect(registrarEvidenciaNaTransicao).not.toHaveBeenCalled();
    expect(concluirOperacao).not.toHaveBeenCalled();
  });
  it('retorna 404 quando a ordem não existe', async () => {
    await expect(viagemService.registrarChegadaLocalSvo(404, motoristaSvo))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(ref.estado.updates).toEqual([]);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });
});
