
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERFIS } from '../constants/perfis';

type Chamada = [metodo: string, argumentos: unknown[]];

interface Estado {
  solicitacao?: object;
  solicitacaoSvo?: object;
  viagem?: object;
  viagemAtivaDaSolicitacao?: object;
  ordemAtivaDaSolicitacao?: object;
  veiculo?: Record<string, unknown>;
  motorista?: Record<string, unknown>;
  cnhValida: boolean;
  conflito: { veiculo?: object; motorista?: object };
  ordensDoVeiculo: object[];
  ordemEmOutroVeiculo?: object;
  equipe?: object;
  outrasViagens: Record<
    'veiculo_id' | 'motorista_id',
    { em_andamento: boolean; agendada: boolean }
  >;
  inserts: { tabela: string; valores: Record<string, unknown> }[];
  updates: { tabela: string; valores: Record<string, unknown> }[];
}

const { mockDb, mockTrx, ref } = vi.hoisted(() => {
  const trx = Object.assign(vi.fn(), { raw: vi.fn() });

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
    buscarPorId: vi.fn(async (tipo: string, id: number) => ({
      id,
      tipo_operacao: tipo,
    })),
  },
}));

import { viagemService } from '../services/viagemService';
import { veiculoModel } from '../models/veiculoModel';
import { motoristaModel } from '../models/motoristaModel';
import { auditoriaModel } from '../models/auditoriaModel';
import { viagemModel } from '../models/viagemModel';

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
      return estado.solicitacao;

    case 'solicitacoes_svo':
      return estado.solicitacaoSvo;

    case 'equipes_svo':
      return estado.equipe;

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
      return temChamada(chamadas, 'where', 'vf.veiculo_id')
        ? estado.conflito.veiculo
        : estado.conflito.motorista;

    case 'viagens_frota':
      return temChamada(chamadas, 'forUpdate')
        ? estado.viagem
        : estado.viagemAtivaDaSolicitacao;

    case 'ordens_svo':
      if (terminal === 'await') {
        return estado.ordensDoVeiculo;
      }

      if (temChamada(chamadas, 'forUpdate')) {
        return estado.viagem;
      }

      if (temChamada(chamadas, 'whereNot')) {
        return estado.ordemEmOutroVeiculo;
      }

      return estado.ordemAtivaDaSolicitacao;

    default:
      return undefined;
  }
}

function criarConsulta(tabela: string) {
  const chamadas: Chamada[] = [];
  const consulta: Record<string, any> = {};

  for (const metodo of [
    'where',
    'whereIn',
    'whereNot',
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
          ['EM_ANDAMENTO', 'EM_DESLOCAMENTO'].includes(
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
    ordensDoVeiculo: [],
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
    capacidade_utilizada: 2,
  };

  beforeEach(() => {
    ref.estado.veiculo = {
      ...ref.estado.veiculo,
      tipo_frota: 'SVO',
    };

    ref.estado.motorista = {
      ...ref.estado.motorista,
      tipo_motorista: 'SVO',
    };
  });

  it('deve impedir o gestor de frota de criar ordem SVO', async () => {
    await expect(
      viagemService.criar(dados, gestorFrota)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('deve rejeitar solicitação SVO concluída', async () => {
    ref.estado.solicitacaoSvo = {
      id: 7,
      status: 'CONCLUIDA',
    };

    await expect(
      viagemService.criar(dados, gestorSvo)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve rejeitar quando a capacidade do veículo é excedida', async () => {
    ref.estado.ordensDoVeiculo = [
      {
        motorista_id: 20,
        capacidade_utilizada: 3,
        status: 'ALOCADA',
      },
    ];

    await expect(
      viagemService.criar(dados, gestorSvo)
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        'O veículo não tem capacidade suficiente (vagas disponíveis: 1)',
    });
  });

  it('deve rejeitar veículo alocado a outro motorista', async () => {
    ref.estado.ordensDoVeiculo = [
      {
        motorista_id: 21,
        capacidade_utilizada: 1,
        status: 'ALOCADA',
      },
    ];

    await expect(
      viagemService.criar(dados, gestorSvo)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deve rejeitar veículo em deslocamento', async () => {
    ref.estado.ordensDoVeiculo = [
      {
        motorista_id: 20,
        capacidade_utilizada: 1,
        status: 'EM_DESLOCAMENTO',
      },
    ];

    await expect(
      viagemService.criar(dados, gestorSvo)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deve rejeitar motorista alocado em outro veículo', async () => {
    ref.estado.ordemEmOutroVeiculo = { id: 3 };

    await expect(
      viagemService.criar(dados, gestorSvo)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('deve rejeitar equipe inexistente', async () => {
    ref.estado.equipe = undefined;

    await expect(
      viagemService.criar(dados, gestorSvo)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve criar a ordem alocada com a capacidade informada', async () => {
    ref.estado.ordensDoVeiculo = [
      {
        motorista_id: 20,
        capacidade_utilizada: 2,
        status: 'ALOCADA',
      },
    ];

    await expect(
      viagemService.criar(dados, gestorSvo)
    ).resolves.toEqual({
      id: 99,
      tipo_operacao: 'SVO',
    });

    expect(ref.estado.inserts).toContainEqual({
      tabela: 'ordens_svo',
      valores: expect.objectContaining({
        status: 'ALOCADA',
        capacidade_utilizada: 2,
        equipe_id: 2,
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

    await expect(viagemService.iniciarViagem('SVO', 5, 1000, gestorSvo)).rejects.toMatchObject({
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
      gestorSvo
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

  it('deve rejeitar km final menor que o km inicial', async () => {
    await expect(
      viagemService.finalizarViagem(
        'ADMINISTRATIVA',
        5,
        999,
        gestorFrota
      )
    ).rejects.toMatchObject({ statusCode: 400 });
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

  it('deve concluir a solicitação SVO junto com a ordem', async () => {
    ref.estado.viagem = {
      id: 5,
      solicitacao_id: 7,
      status: 'EM_DESLOCAMENTO',
      km_inicial: 1000,
      veiculo_id: 10,
      motorista_id: 20,
    };

    await viagemService.finalizarViagem(
      'SVO',
      5,
      1050,
      gestorSvo
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

  it('deve devolver a solicitação SVO para triagem ao cancelar a ordem', async () => {
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
      valores: { status: 'EM_TRIAGEM' },
    });
  });
});
