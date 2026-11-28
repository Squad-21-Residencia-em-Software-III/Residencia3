import { describe, expect, it } from 'vitest';
import {
  calcularDistanciaOdometroKm,
  calcularLimitesCoordenadas,
  criarFeatureCollectionLinhas,
  decodificarPolyline5,
  formatarDistanciaKm,
  formatarHorarioCheckpoint,
  gerarCirculoGeoJson,
} from './geometriaRota';

function codificarValorPolyline5(valor: number): string {
  let v = valor < 0 ? ~(valor << 1) : valor << 1;
  let saida = '';
  while (v >= 0x20) {
    saida += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  saida += String.fromCharCode(v + 63);
  return saida;
}

function codificarPolyline5(pontos: { latitude: number; longitude: number }[]): string {
  let anteriorLat = 0;
  let anteriorLon = 0;
  let encoded = '';
  for (const ponto of pontos) {
    const lat = Math.round(ponto.latitude * 1e5);
    const lon = Math.round(ponto.longitude * 1e5);
    encoded += codificarValorPolyline5(lat - anteriorLat);
    encoded += codificarValorPolyline5(lon - anteriorLon);
    anteriorLat = lat;
    anteriorLon = lon;
  }
  return encoded;
}

describe('geometriaRota', () => {
  it('decodifica polyline5 válida preservando precisão de 5 casas decimais', () => {
    const entrada = [
      { latitude: -10.9472, longitude: -37.0731 },
      { latitude: -10.925, longitude: -37.065 },
      { latitude: -10.9167, longitude: -37.0772 },
    ];
    const encoded = codificarPolyline5(entrada);

    const resultado = decodificarPolyline5(encoded);

    expect(resultado.invalida).toBe(false);
    expect(resultado.pontos).toHaveLength(3);
    expect(resultado.pontos[0]!.latitude).toBeCloseTo(-10.9472, 4);
    expect(resultado.pontos[0]!.longitude).toBeCloseTo(-37.0731, 4);
    expect(resultado.pontos[2]!.latitude).toBeCloseTo(-10.9167, 4);
    expect(resultado.pontos[2]!.longitude).toBeCloseTo(-37.0772, 4);
  });

  it('trata polyline5 vazia, truncada, com caractere inválido ou ponto único', () => {
    expect(decodificarPolyline5(null)).toEqual({ pontos: [], invalida: false });
    expect(decodificarPolyline5('')).toEqual({ pontos: [], invalida: false });
    expect(decodificarPolyline5('!!!invalido')).toEqual({ pontos: [], invalida: true });

    const valida = codificarPolyline5([
      { latitude: -10.9472, longitude: -37.0731 },
      { latitude: -10.9167, longitude: -37.0772 },
    ]);
    // Trunca o último byte da string codificada
    expect(decodificarPolyline5(valida.slice(0, 2)).invalida).toBe(true);

    // Apenas 1 ponto não forma linha
    const umPonto = codificarPolyline5([{ latitude: -10.9472, longitude: -37.0731 }]);
    expect(decodificarPolyline5(umPonto)).toEqual({ pontos: [], invalida: true });
  });

  it('calcula limites para 0, 1 e N pontos corretamente', () => {
    expect(calcularLimitesCoordenadas([])).toEqual({ centroUnico: null, limites: null });

    const unico = calcularLimitesCoordenadas([{ latitude: -10.9472, longitude: -37.0731 }]);
    expect(unico.centroUnico).toEqual({ latitude: -10.9472, longitude: -37.0731 });
    expect(unico.limites).toBeNull();

    const multiplos = calcularLimitesCoordenadas([
      { latitude: -10.9472, longitude: -37.0731 },
      { latitude: -10.9167, longitude: -37.0512 },
    ]);
    expect(multiplos.centroUnico).toBeNull();
    expect(multiplos.limites).toEqual([
      [-37.0731, -10.9472],
      [-37.0512, -10.9167],
    ]);
  });

  it('gera polígono GeoJSON fechado para círculo de incerteza > 150m', () => {
    const circulo = gerarCirculoGeoJson({ latitude: -10.93, longitude: -37.06 }, 220, 24);
    expect(circulo.geometry.type).toBe('Polygon');
    const anel = circulo.geometry.coordinates[0]!;
    expect(anel).toHaveLength(25);
    expect(anel[0]).toEqual(anel[anel.length - 1]);
    expect(circulo.properties?.raioMetros).toBe(220);
  });

  it('monta FeatureCollection de linhas ignorando segmentos com menos de 2 pontos', () => {
    const fc = criarFeatureCollectionLinhas([
      [{ latitude: -10.94, longitude: -37.07 }],
      [
        { latitude: -10.94, longitude: -37.07 },
        { latitude: -10.92, longitude: -37.05 },
      ],
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.coordinates).toEqual([
      [-37.07, -10.94],
      [-37.05, -10.92],
    ]);
  });

  it('formata distâncias, horários e calcula diferença de odômetro', () => {
    expect(formatarDistanciaKm(850)).toBe('850 m');
    expect(formatarDistanciaKm(14800)).toBe('14,8 km');
    expect(formatarDistanciaKm(null)).toBe('—');
    expect(formatarHorarioCheckpoint('08:22')).toBe('08:22');
    expect(calcularDistanciaOdometroKm({ kmInicial: 42110, kmFinal: 42126 })).toBe(16);
    expect(calcularDistanciaOdometroKm({ kmInicial: 42126, kmFinal: 42110 })).toBeNull();
    expect(calcularDistanciaOdometroKm({ kmInicial: 42110, kmFinal: null })).toBeNull();
  });
});
