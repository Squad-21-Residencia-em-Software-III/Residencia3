import { beforeEach, describe, expect, it, vi } from 'vitest';

type Chamada = [string, unknown[]];
const { dbMock, consultas } = vi.hoisted(() => ({
  dbMock: Object.assign(vi.fn(), { raw: vi.fn((sql: string) => sql) }),
  consultas: [] as Chamada[][],
}));
vi.mock('../config/database', () => ({ db: dbMock }));
import { viagemModel } from '../models/viagemModel';

function consulta() {
  const chamadas: Chamada[] = [];
  consultas.push(chamadas);
  const q: Record<string, any> = {};
  for (const metodo of ['innerJoin', 'where', 'select', 'orderBy', 'limit']) {
    q[metodo] = (...args: unknown[]) => { chamadas.push([metodo, args]); return q; };
  }
  q.offset = async (...args: unknown[]) => { chamadas.push(['offset', args]); return []; };
  q.count = (...args: unknown[]) => { chamadas.push(['count', args]); return q; };
  q.first = async () => ({ total: '0' });
  return q;
}

describe('consultas restritas de viagens', () => {
  beforeEach(() => { consultas.length = 0; dbMock.mockReset().mockImplementation(consulta); });

  it('aplica titularidade antes da paginação e também à contagem', async () => {
    await viagemModel.listarAdministrativasDoSolicitante(42, 3, 10);
    expect(consultas).toHaveLength(2);
    for (const q of consultas) expect(q).toContainEqual(['where', ['sv.solicitante_id', 42]]);
    expect(consultas[0]).toContainEqual(['offset', [20]]);
    const campos = consultas[0].filter(([metodo]) => metodo === 'select').flatMap(([, args]) => args);
    expect(campos).not.toContain('vf.motorista_id');
    expect(campos).not.toContain('vf.km_inicial');
    expect(campos).not.toContain('sv.*');
  });

  it('seleciona somente ordens aguardando alocação e confirmadas', async () => {
    await viagemModel.listarOrdensPendentesSvo(2, 10);
    for (const q of consultas) {
      expect(q).toContainEqual(['where', ['o.status', 'AGUARDANDO_ALOCACAO']]);
      expect(q).toContainEqual(['where', ['s.status', 'CONFIRMADA']]);
    }
    expect(consultas[0]).toContainEqual(['offset', [10]]);
  });
});
