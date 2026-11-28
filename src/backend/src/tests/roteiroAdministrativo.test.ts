import { describe, expect, it, vi } from 'vitest';
import { calcularRoteiroAdministrativo, roteiroAdministrativoSchema, validarRevisaoRoteiroAdministrativo } from '../services/roteiroAdministrativo';
import { criarMapasService } from '../services/mapasService';

const local = (latitude: number) => ({ endereco: 'Endereço de teste', coordenadas: { latitude, longitude: -37 } });
const dados = { origem: local(-10), destino: local(-12), paradas: [local(-11)], retornarOrigem: true,
  inicioPrevisto: '2026-11-27T13:00:00-03:00', fimPrevisto: '2026-11-27T14:00:00-03:00' };
const contexto = { sinal: new AbortController().signal, prazoMs: 2500 };

describe('cálculo administrativo de roteiro', () => {
  it('aceita 0 a 8 paradas, rejeita 9 e exige um período válido', () => {
    const validar = (total: number) =>
      roteiroAdministrativoSchema.safeParse({ ...dados, paradas: Array.from({ length: total }, () => local(-11)) });
    expect(validar(0).success).toBe(true);
    expect(validar(8).success).toBe(true);
    expect(validar(9).success).toBe(false);
    expect(roteiroAdministrativoSchema.safeParse({ ...dados, fimPrevisto: dados.inicioPrevisto }).success).toBe(false);
  });
  it('usa a sequência manual e o retorno como trecho com a duração do OSRM', async () => {
    const http = vi.fn<typeof fetch>(async () => Response.json({
      code: 'Ok', routes: [{ distance: 8001, duration: 720.1, geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }],
    }));
    const mapas = criarMapasService({ entradas: 10, orcamentoMs: 2500, http, registrar: () => {} });
    const resultado = await calcularRoteiroAdministrativo(roteiroAdministrativoSchema.parse(dados), mapas.rota, contexto);
    expect(String(http.mock.calls[0]?.[0])).toContain('-37,-10;-37,-11;-37,-12;-37,-10');
    expect(resultado).toMatchObject({ metodo: 'OSRM', distanciaMetros: 8001, duracaoSegundos: 720 });
  });
  it('preserva endereço livre sem fabricar cálculo com coordenadas incompletas', async () => {
    const calcular = vi.fn();
    const roteiro = roteiroAdministrativoSchema.parse({ ...dados, paradas: [{ endereco: 'Somente o endereço' }] });
    expect(await calcularRoteiroAdministrativo(roteiro, calcular, contexto))
      .toEqual({ metodo: 'INDISPONIVEL', motivo: 'SEM_COORDENADAS' });
    expect(calcular).not.toHaveBeenCalled();
  });
});

it('detecta versão antiga, identidade alheia e alterações em parada decidida', () => {
  const realizada = { ...dados.paradas[0]!, id: 33 };
  const vigente = { versao: 9, paradas: [{ ...realizada, estado: 'REALIZADA' as const }] };
  const proposta = { versaoRoteiro: 9, justificativa: 'Ajuste aprovado', roteiro: { ...dados, paradas: [realizada] } };
  expect(validarRevisaoRoteiroAdministrativo(proposta, vigente).versaoRoteiro).toBe(9);
  expect(() => validarRevisaoRoteiroAdministrativo({ ...proposta, versaoRoteiro: 8 }, vigente)).toThrow();
  expect(() => validarRevisaoRoteiroAdministrativo({
    ...proposta, roteiro: { ...dados, paradas: [{ ...realizada, id: 55 }] },
  }, vigente)).toThrow();
  expect(() => validarRevisaoRoteiroAdministrativo({
    ...proposta, roteiro: { ...dados, paradas: [{ ...realizada, endereco: 'Outro local' }] },
  }, vigente)).toThrow();
});
