import { beforeEach, describe, expect, it, vi } from 'vitest';

type Chamada = [metodo: string, argumentos: unknown[]];

const { dbMock, estado } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  estado: { chamadas: [] as Chamada[][], dados: [] as unknown[], total: '0' },
}));

vi.mock('../config/database', () => ({ db: dbMock }));

import { solicitacaoViagemModel } from '../models/solicitacaoViagemModel';

// Consulta encadeável que registra as chamadas; clone() gera uma nova consulta com o histórico
function criarConsulta(historico: Chamada[]): Record<string, any> {
  const chamadas = [...historico];
  estado.chamadas.push(chamadas);
  const consulta: Record<string, any> = {};

  for (const metodo of ['where', 'leftJoin', 'joinRaw', 'select', 'orderBy', 'limit']) {
    consulta[metodo] = (...argumentos: unknown[]) => {
      chamadas.push([metodo, argumentos]);
      return consulta;
    };
  }
  consulta.modify = (callback: (q: unknown) => void) => {
    callback(consulta);
    return consulta;
  };
  consulta.clone = () => criarConsulta(chamadas);
  consulta.offset = async (...argumentos: unknown[]) => {
    chamadas.push(['offset', argumentos]);
    return estado.dados;
  };
  consulta.count = async () => [{ total: estado.total }];

  return consulta;
}

describe('solicitacaoViagemModel.listarDoSolicitante', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    estado.chamadas = [];
    dbMock.mockImplementation(() => criarConsulta([]));
  });

  it('filtra pelo solicitante e pelo status, com paginação', async () => {
    estado.dados = [{ id: 1, status: 'AGENDADA', viagem_status: 'AGENDADA' }];
    estado.total = '12';

    const resultado = await solicitacaoViagemModel.listarDoSolicitante(7, {
      pagina: 3,
      limite: 5,
      status: 'AGENDADA',
    });

    expect(dbMock).toHaveBeenCalledWith('solicitacoes_viagem as sv');
    expect(resultado).toEqual({ dados: estado.dados, total: 12 });

    const [, consultaDados, consultaContagem] = estado.chamadas;
    for (const consulta of [consultaDados, consultaContagem]) {
      expect(consulta).toContainEqual(['where', ['sv.solicitante_id', 7]]);
      expect(consulta).toContainEqual(['where', ['sv.status', 'AGENDADA']]);
    }
    expect(consultaDados).toContainEqual(['limit', [5]]);
    expect(consultaDados).toContainEqual(['offset', [10]]);
  });

  it('traz a viagem vigente, ignorando as canceladas', async () => {
    await solicitacaoViagemModel.listarDoSolicitante(7, { pagina: 1, limite: 20 });

    const consultaDados = estado.chamadas[1];
    const joinRaw = consultaDados.find(([metodo]) => metodo === 'joinRaw');
    expect(String(joinRaw?.[1][0])).toMatch(/LEFT JOIN LATERAL[\s\S]*vf\.solicitacao_id = sv\.id[\s\S]*<> 'CANCELADA'/);
    expect(consultaDados.filter(([metodo]) => metodo === 'where')).toEqual([['where', ['sv.solicitante_id', 7]]]);
  });
});
