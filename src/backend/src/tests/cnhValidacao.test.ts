import { describe, expect, it } from 'vitest';
import { cnhVencida, dataCivilValida, hojeCivil, mascararCnh, normalizarCnh, validarEstruturaCnh } from '../constants/cnh';
import { escritaMotoristasLigada } from '../config/motoristas';
import { motoristasLegado } from './fixtures/motoristasLegado';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { inventariar } = require('../../scripts/inventariar-cnh-motoristas.cjs');

describe('estrutura da CNH (sem dígito verificador)', () => {
  it('preserva zeros e remove só os separadores aceitos', () => {
    expect(normalizarCnh(' 000.123.456-78 ')).toBe('00012345678');
    expect(normalizarCnh('0001/2345678')).toBe('0001/2345678');
  });

  it.each([
    ['00012345678', null],
    ['98765432109', null],
    ['1234567890', 'FORMATO'],
    ['123456789012', 'FORMATO'],
    ['1234567890A', 'FORMATO'],
    ['00000000000', 'MANIFESTAMENTE_INVALIDO'],
    ['99999999999', 'MANIFESTAMENTE_INVALIDO'],
  ])('%s → %s', (numero, esperado) => {
    expect(validarEstruturaCnh(numero)).toBe(esperado);
  });

  it('mascara com os 4 dígitos finais', () => {
    expect(mascararCnh('7890')).toBe('•••••••7890');
  });
});

describe('data civil estrita', () => {
  it.each(['2024-02-29', '2000-02-29', '2030-12-31', '2030-04-30'])('aceita %s', (data) => {
    expect(dataCivilValida(data)).toBe(true);
  });

  it.each(['2023-02-29', '1900-02-29', '2100-02-29', '2030-04-31', '2030-00-10', '2030-1-01', '20300101', ''])(
    'rejeita %s',
    (data) => {
      expect(dataCivilValida(data)).toBe(false);
    }
  );

  it('vencimento compara datas civis no fuso do serviço', () => {
    // 02:00 UTC de 1º/jan ainda é 31/dez em São Paulo
    expect(hojeCivil(new Date('2030-01-01T02:00:00Z'))).toBe('2029-12-31');
    expect(cnhVencida('2029-12-31', '2029-12-31')).toBe(false);
    expect(cnhVencida('2029-12-30', '2029-12-31')).toBe(true);
  });
});

describe('flag MOTORISTAS_ESCRITA_ATIVA', () => {
  it('desligada por padrão e estrita', () => {
    expect(escritaMotoristasLigada(undefined)).toBe(false);
    expect(escritaMotoristasLigada('')).toBe(false);
    expect(escritaMotoristasLigada('true')).toBe(true);
    expect(() => escritaMotoristasLigada('sim')).toThrow('MOTORISTAS_ESCRITA_ATIVA');
  });
});

describe('inventário de legado (fixture sintética)', () => {
  const resultado = inventariar(motoristasLegado, '2026-11-28');

  it('classifica formatos e categorias', () => {
    expect(resultado.total).toBe(motoristasLegado.length);
    expect(resultado.formatos).toEqual({
      ONZE_DIGITOS: 3,
      ONZE_DIGITOS_COM_SEPARADORES: 1,
      COMPRIMENTO_DIFERENTE_DE_11: 1,
      COM_CARACTERES_NAO_NUMERICOS: 1,
      DIGITOS_REPETIDOS: 1,
    });
    expect(resultado.categorias['FORA_DA_LISTA:ACC']).toBe(1);
    expect(resultado.vencidas).toBe(1);
    expect(resultado.semUsuario).toBe(1);
  });

  it('aponta colisões sem expor o número completo', () => {
    expect(resultado.colisoesCnh).toEqual([{ final: '7890', ids: [1, 2] }]);
    expect(resultado.colisoesUsuario).toEqual([{ usuario_id: 30, ids: [5, 6] }]);
    expect(resultado.podeAplicarRestricao).toBe(false);
    const saida = JSON.stringify(resultado);
    for (const { numero_cnh } of motoristasLegado) {
      if (numero_cnh.replace(/\D/g, '').length >= 8) expect(saida).not.toContain(numero_cnh.replace(/\D/g, ''));
    }
  });

  it('libera a restrição quando não há colisões', () => {
    expect(inventariar(motoristasLegado.filter((m) => ![2, 6].includes(m.id)), '2026-11-28').podeAplicarRestricao).toBe(true);
  });
});
