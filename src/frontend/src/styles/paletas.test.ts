/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contraste,
  corParaLinear,
  distancia,
  simular,
  variaveis,
  type Deficiencia,
} from '../test/simulacaoCores';
import { PALETAS } from '../utils/preferenciasAcessibilidade';

// SCRUM-307: cada paleta mantém o contraste dos textos de status e separa as categorias que a deficiência
// correspondente confunde. Simulação de Machado et al. (2009), severidade máxima.

const BRANCO = 'branco';
// Lidos do disco: no Vitest, importar CSS com ?raw devolve texto vazio
const ler = (relativo: string) => readFileSync(new URL(relativo, import.meta.url), 'utf8');
const paletasCss = ler('./paletas.css');
const globalCss = ler('./global.css');
const temaTailwind = ler('../../node_modules/tailwindcss/theme.css');

/** Variáveis redefinidas por paleta, lidas do CSS gerado. */
function sobrescritas(): Record<string, Record<string, string>> {
  const porPaleta: Record<string, Record<string, string>> = {};
  for (const [, seletores, corpo] of paletasCss.matchAll(/((?::root\[data-paleta='[a-z]+'\],?\s*)+)\{([^}]*)\}/g)) {
    for (const [, paleta] of seletores.matchAll(/data-paleta='([a-z]+)'/g)) {
      porPaleta[paleta] = { ...porPaleta[paleta], ...variaveis(corpo) };
    }
  }
  return porPaleta;
}

const base = { ...variaveis(temaTailwind), ...variaveis(globalCss) };
const porPaleta = sobrescritas();
const cor = (paleta: string, nome: string) =>
  nome === BRANCO ? corParaLinear('#ffffff') : corParaLinear(porPaleta[paleta]?.[nome] ?? base[nome]);

// Texto sobre fundo, como aparecem nos componentes (Badge, Alert, MetricCard e textos de status)
const TEXTO_SOBRE_FUNDO: [string, string][] = [
  ['success', 'success-bg'],
  ['warning', 'warning-bg'],
  ['info', 'info-bg'],
  ['danger-strong', 'danger-bg'],
  ['purple', 'purple-bg'],
  ['emerald-800', 'emerald-50'],
  ['rose-800', 'rose-50'],
  ['amber-800', 'amber-50'],
  ['blue-800', 'blue-50'],
  ['emerald-700', BRANCO],
  ['rose-700', BRANCO],
  ['amber-700', BRANCO],
  ['blue-700', BRANCO],
];

// Tons fortes de cada categoria (tokens e as famílias do Tailwind usadas nas telas)
const CATEGORIAS = {
  tokens: ['success', 'danger', 'warning', 'info', 'purple'],
  tailwind: ['emerald-700', 'rose-700', 'amber-700', 'blue-700', 'violet-700'],
};

const DEFICIENCIA: Record<string, Deficiencia> = {
  protanopia: 'protanopia',
  deuteranopia: 'deuteranopia',
  tritanopia: 'tritanopia',
};

/** Menor distância entre as categorias, vistas com a deficiência. */
function piorPar(paleta: string, nomes: string[], deficiencia: Deficiencia) {
  let pior = { distancia: Infinity, par: '' };
  for (let i = 0; i < nomes.length; i += 1) {
    for (let j = i + 1; j < nomes.length; j += 1) {
      const d = distancia(simular(cor(paleta, nomes[i]), deficiencia), simular(cor(paleta, nomes[j]), deficiencia));
      if (d < pior.distancia) pior = { distancia: d, par: `${nomes[i]} × ${nomes[j]}` };
    }
  }
  return pior;
}

describe('paletas de cores (SCRUM-307)', () => {
  it('o CSS gerado tem um bloco para cada paleta não padrão', () => {
    expect(Object.keys(porPaleta).sort()).toEqual(PALETAS.filter((p) => p !== 'padrao').sort());
  });

  describe.each(PALETAS)('paleta %s', (paleta) => {
    it.each(TEXTO_SOBRE_FUNDO)('%s sobre %s tem contraste de pelo menos 4,5:1', (texto, fundo) => {
      expect(contraste(cor(paleta, texto), cor(paleta, fundo))).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe.each(Object.keys(DEFICIENCIA))('paleta %s, vista com a deficiência correspondente', (paleta) => {
    it.each(Object.entries(CATEGORIAS))('separa as categorias de status (%s)', (_grupo, nomes) => {
      const { distancia: d, par } = piorPar(paleta, nomes, DEFICIENCIA[paleta]);
      // 0,08 ≈ quatro vezes a menor diferença notável em OKLab; o ícone e o texto de cada status completam
      expect(d, `par mais próximo: ${par}`).toBeGreaterThanOrEqual(0.08);
    });

    it('separa mais do que a paleta padrão', () => {
      const comPaleta = piorPar(paleta, CATEGORIAS.tokens, DEFICIENCIA[paleta]).distancia;
      const padrao = piorPar('padrao', CATEGORIAS.tokens, DEFICIENCIA[paleta]).distancia;
      expect(comPaleta).toBeGreaterThan(padrao);
    });
  });
});
