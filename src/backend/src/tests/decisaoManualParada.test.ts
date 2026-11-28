import { expect, it } from 'vitest';
import { validarDecisaoManualParada } from '../services/decisaoManualParada';

const estado = { viagemAtiva: true, motoristaId: 2, atorId: 2, proximaParadaId: 3, versaoRoteiro: 4 };
const dados = { paradaId: 3, versaoRoteiro: 4, chaveIdempotencia: '3edd31b3-1377-4f97-a1a8-41949f5e8930' };

it('vincula a decisão manual ao motorista, à próxima parada e à revisão', () => {
  const decisao = { ...dados, decisao: 'NAO_REALIZADA', motivo: '  Local fechado  ' };
  expect(validarDecisaoManualParada(decisao, estado)).toMatchObject({ motivo: 'Local fechado' });
  expect(() => validarDecisaoManualParada({ ...decisao, motivo: ' ' }, estado)).toThrow();
  expect(() => validarDecisaoManualParada(decisao, { ...estado, versaoRoteiro: 5 })).toThrow();
  expect(() => validarDecisaoManualParada(decisao, { ...estado, proximaParadaId: 6 })).toThrow();
  expect(() => validarDecisaoManualParada(decisao, { ...estado, atorId: 1 })).toThrow();
  expect(() => validarDecisaoManualParada({ ...dados, decisao: 'REALIZADA' }, estado)).toThrow();
});
