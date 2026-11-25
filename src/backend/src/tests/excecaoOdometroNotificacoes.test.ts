import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTrx, mockDb } = vi.hoisted(() => {
  const trx = Object.assign(vi.fn(), {
    isTransaction: true,
    fn: { now: () => new Date('2026-11-25T12:00:00Z') },
  });

  return {
    mockTrx: trx,
    mockDb: {
      transaction: vi.fn(async (callback: (trx: unknown) => Promise<unknown>) =>
        callback(trx)),
    },
  };
});

vi.mock('../config/env', () => ({
  env: {
    excecoesOdometroAtivas: true,
  },
}));
vi.mock('../config/database', () => ({
  db: mockDb,
}));

vi.mock('../services/publicacaoNotificacoes', () => ({
  publicarNotificacao: vi.fn(async () => ({ criadas: 1 })),
}));

vi.mock('../models/auditoriaModel', () => ({
  MODULOS_AUDITORIA: { VIAGENS: 'VIAGENS' },
  auditoriaModel: {
    registrar: vi.fn(async () => undefined),
  },
}));

vi.mock('../services/viagemService', () => ({
  OPERACOES: {
    ADMINISTRATIVA: {
      agendada: 'AGENDADA',
      emAndamento: 'EM_ANDAMENTO',
    },
    SVO: {
      agendada: 'ALOCADA',
      emAndamento: 'EM_DESLOCAMENTO',
    },
  },
  buscarParaAtualizar: vi.fn(async () => ({
    id: 10,
    status: 'AGENDADA',
    motorista_id: 20,
    veiculo_id: 30,
  })),
  garantirAcesso: vi.fn(),
  garantirAcessoAoRegistro: vi.fn(async () => undefined),
}));

vi.mock('../services/evidenciaOdometroTransicao', () => ({
  evidenciaDaFase: vi.fn(async () => undefined),
  deslocamentoDaOrdem: vi.fn(async () => undefined),
  deslocamentoEmCursoDoVeiculo: vi.fn(async () => undefined),
}));

vi.mock('../services/agendaSvoService', () => ({
  travarAgendaSvo: vi.fn(async () => undefined),
}));
vi.mock('../models/excecaoOdometroModel', () => ({
  chaveExcecao: vi.fn((tipo: string, id: number) => ({
    tipo_operacao: tipo,
    [tipo === 'SVO' ? 'ordem_svo_id' : 'viagem_frota_id']: id,
  })),
  excecoesDoRegistro: vi.fn((trx: Function) => trx('excecoes_odometro')),
  apresentarExcecao: vi.fn((registro: unknown) => registro),
}));
const registroExcecao = {
  id: 55,
  tipo_operacao: 'ADMINISTRATIVA',
  viagem_frota_id: 10,
  ordem_svo_id: null,
  fase: 'SAIDA',
  veiculo_id: 30,
  motorista_id: 20,
  solicitada_por: 7,
  motivo: 'Teste ficticio',
  status: 'PENDENTE',
  encerrada_em: null,
};

function prepararTransacaoSolicitacao(existente = false) {
  mockTrx.mockImplementation((tabela: string) => {
    if (tabela !== 'excecoes_odometro') {
      throw new Error(`Tabela inesperada no teste: ${tabela}`);
    }

    const consulta = {
      where() {
        return consulta;
      },
      whereNull() {
        return consulta;
      },
      whereIn() {
        return consulta;
      },
      async first() {
        return existente ? registroExcecao : undefined;
      },
      insert() {
        return consulta;
      },
      async returning() {
        return [registroExcecao];
      },
    };

    return consulta;
  });
}
vi.mock('../services/eventosExcecaoOdometro', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('../services/eventosExcecaoOdometro')
  >();

  return {
    ...original,
    destinatariosExcecaoOdometro: vi.fn(async () => [1, 2, 3]),
  };
});
function prepararTransacaoDecisao() {
  mockTrx.mockImplementation((tabela: string) => {
    const consulta = {
      where() {
        return consulta;
      },
      forUpdate() {
        return consulta;
      },
      async first() {
        if (tabela === 'motoristas') {
          return { usuario_id: 7 };
        }
        return registroExcecao;
      },
      insert() {
        return consulta;
      },
      update() {
        return consulta;
      },
      async returning() {
        if (tabela === 'auditorias') {
          return [{ id: 99 }];
        }
        return [{ ...registroExcecao, status: 'APROVADA' }];
      },
    };

    if (!['excecoes_odometro', 'motoristas', 'auditorias'].includes(tabela)) {
      throw new Error(`Tabela inesperada no teste: ${tabela}`);
    }

    return consulta;
  });
}
import { publicarNotificacao } from '../services/publicacaoNotificacoes';
import { excecaoOdometroService } from '../services/excecaoOdometroService';
import { PERFIS } from '../constants/perfis';

describe('Integracao das notificacoes A9 e A10', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('utiliza um publicador simulado, sem acessar o banco real', () => {
    expect(vi.isMockFunction(publicarNotificacao)).toBe(true);
    expect(vi.isMockFunction(mockDb.transaction)).toBe(true);
    expect(vi.isMockFunction(mockTrx)).toBe(true);
  });
});
describe('A9 - Publicacao de solicitacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nao publica novamente quando a excecao ja existe', async () => {
    prepararTransacaoSolicitacao(true);

    await excecaoOdometroService.solicitar(
      {
        tipo_operacao: 'ADMINISTRATIVA',
        viagem_id: 10,
        fase: 'SAIDA',
        motivo: 'Teste ficticio',
      },
      { id: 7, perfil: PERFIS.MOTORISTA_FROTA }
    );

    expect(publicarNotificacao).not.toHaveBeenCalled();
  });
  it('publica uma notificacao ao criar uma nova excecao', async () => {
    prepararTransacaoSolicitacao(false);

    await excecaoOdometroService.solicitar(
      {
        tipo_operacao: 'ADMINISTRATIVA',
        viagem_id: 10,
        fase: 'SAIDA',
        motivo: 'Teste ficticio',
      },
      { id: 7, perfil: PERFIS.MOTORISTA_FROTA }
    );

    expect(publicarNotificacao).toHaveBeenCalledOnce();

    expect(publicarNotificacao).toHaveBeenCalledWith(
      mockTrx,
      expect.objectContaining({
        tipo: 'EXCECAO_ODOMETRO_SOLICITADA',
        operacao: 'Administrativo',
        ocorrencia: 'solicitada',
        autorId: 7,
        destinatarios: [1, 2, 3],
        urlDestino: '/viagens',
        referencia: {
          tipo: 'EXCECAO_ODOMETRO',
          id: 55,
        },
      })
    );
  });
});
describe('A10 - Publicacao de decisao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifica o motorista quando a excecao e aprovada', async () => {
    prepararTransacaoDecisao();

    await excecaoOdometroService.decidir(
      55,
      'ADMINISTRATIVA',
      'APROVADA',
      'Justificativa ficticia',
      { id: 1, perfil: PERFIS.GESTOR_FROTA }
    );

    expect(publicarNotificacao).toHaveBeenCalledOnce();

    expect(publicarNotificacao).toHaveBeenCalledWith(
      mockTrx,
      expect.objectContaining({
        tipo: 'EXCECAO_ODOMETRO_DECIDIDA',
        operacao: 'Administrativo',
        ocorrencia: 'aprovada',
        severidade: 'success',
        autorId: 1,
        destinatarios: [7],
        urlDestino: '/viagens',
        referencia: {
          tipo: 'EXCECAO_ODOMETRO',
          id: 55,
        },
      })
    );
  });
});
describe('A10 - Recusa de excecao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifica o motorista quando a excecao e recusada', async () => {
    prepararTransacaoDecisao();

    await excecaoOdometroService.decidir(
      55,
      'ADMINISTRATIVA',
      'RECUSADA',
      'Justificativa ficticia',
      { id: 1, perfil: PERFIS.GESTOR_FROTA }
    );

    expect(publicarNotificacao).toHaveBeenCalledOnce();

    expect(publicarNotificacao).toHaveBeenCalledWith(
      mockTrx,
      expect.objectContaining({
        tipo: 'EXCECAO_ODOMETRO_DECIDIDA',
        operacao: 'Administrativo',
        ocorrencia: 'recusada',
        severidade: 'warning',
        autorId: 1,
        destinatarios: [7],
        urlDestino: '/viagens',
        referencia: {
          tipo: 'EXCECAO_ODOMETRO',
          id: 55,
        },
        push: expect.objectContaining({
          categoria: 'VIAGENS',
          corpo: 'Seu pedido de exceção foi recusado.',
        }),
      })
    );
  });
});
describe('A10 - Decisao invalida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nao publica quando a excecao ja foi decidida', async () => {
    prepararTransacaoDecisao();

    const { excecoesDoRegistro } = await import('../models/excecaoOdometroModel.js');
    const modelo = vi.mocked(excecoesDoRegistro);

    const consultaOriginal = modelo.getMockImplementation();

    modelo.mockImplementationOnce((...args: Parameters<typeof excecoesDoRegistro>) => {
      const consulta = consultaOriginal!(...args);

      consulta.first = vi.fn(async () => ({
        ...registroExcecao,
        status: 'APROVADA',
      })) as unknown as typeof consulta.first;

      return consulta;
    });

    await expect(
      excecaoOdometroService.decidir(
        55,
        'ADMINISTRATIVA',
        'RECUSADA',
        'Justificativa ficticia',
        { id: 1, perfil: PERFIS.GESTOR_FROTA }
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(publicarNotificacao).not.toHaveBeenCalled();
  });
});