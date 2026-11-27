import { describe, expect, it } from 'vitest';
import { avaliarPermanenciaParada } from '../services/permanenciaParada';

const ids = { viagemId: 1, paradaId: 2, motoristaId: 3, versaoRoteiro: 4 };
const coordenadas = { latitude: -10, longitude: -37 };
const amostra = (capturadoEm: number) => ({
  ...ids, tipo: 'GPS_REAL' as const, coordenadas, precisaoMetros: 4, capturadoEm, recebidoEm: capturadoEm + 100,
});
const contexto = { habilitada: true, operacao: 'ADMINISTRATIVA' as const, parada: { ...ids, coordenadas, pendente: true },
  pedido: { ...ids, registradoEm: 0, respondido: false }, agora: 300_000,
  amostras: [0, 15_000, 30_000, 45_000, 60_000].map(amostra),
  parametros: { intervaloMaximoMs: 15_000, precisaoMaximaMetros: 15 } };

describe('permanência automática para parada administrativa', () => {
  it('exige 5 min de espera e 1 min contínuo com registro real', () => {
    expect(avaliarPermanenciaParada(contexto)).toEqual(amostra(60_000));
    expect(avaliarPermanenciaParada({ ...contexto, agora: 299_999 })).toBeNull();
    expect(avaliarPermanenciaParada({ ...contexto, amostras: contexto.amostras.slice(0, 3) })).toBeNull();
    expect(avaliarPermanenciaParada({ ...contexto, amostras: [amostra(0), amostra(60_000)] })).toBeNull();
  });
  it('não confirma com estimativa, lacuna, baixa precisão ou fora do raio', () => {
    for (const amostraRuim of [
      { ...amostra(30_000), tipo: 'ESTIMATIVA' as const },
      { ...amostra(30_000), tipo: 'LACUNA' as const },
      { ...amostra(30_000), precisaoMetros: 90 },
      { ...amostra(30_000), coordenadas: { ...coordenadas, latitude: -10.01 } },
    ]) {
      expect(avaliarPermanenciaParada({
        ...contexto, amostras: [amostra(0), amostra(15_000), amostraRuim, amostra(45_000), amostra(60_000)],
      })).toBeNull();
    }
  });
  it('rejeita SVO, resposta prévia, vínculo ou sequência errada e parâmetros ausentes', () => {
    expect(avaliarPermanenciaParada({ ...contexto, habilitada: false })).toBeNull();
    expect(avaliarPermanenciaParada({ ...contexto, operacao: 'SVO' })).toBeNull();
    expect(avaliarPermanenciaParada({ ...contexto, pedido: { ...contexto.pedido, respondido: true } })).toBeNull();
    expect(avaliarPermanenciaParada({ ...contexto, parametros: undefined })).toBeNull();
    expect(avaliarPermanenciaParada({ ...contexto, parada: { ...contexto.parada, versaoRoteiro: 5 } })).toBeNull();
    expect(avaliarPermanenciaParada({ ...contexto, amostras: [...contexto.amostras, amostra(45_000)] })).toBeNull();
  });
});
