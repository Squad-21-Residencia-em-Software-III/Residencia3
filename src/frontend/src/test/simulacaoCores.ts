// Utilitários de cor para os testes de contraste e daltonismo (SCRUM-307). Mesmas fórmulas de
// scripts/gerar-paletas.mjs: OKLCH/OKLab (Björn Ottosson), contraste WCAG 2 e simulação de Machado et al. (2009).

export type Rgb = [number, number, number];
export type Deficiencia = 'protanopia' | 'deuteranopia' | 'tritanopia';

const MATRIZES: Record<Deficiencia, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

const limita = (x: number) => Math.min(1, Math.max(0, x));
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function oklabParaLinear([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearParaOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** `#rrggbb` ou `oklch(L% C H)` → sRGB linear. */
export function corParaLinear(valor: string): Rgb {
  const texto = valor.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(texto);
  if (hex) return [0, 2, 4].map((i) => linear(parseInt(hex[1].slice(i, i + 2), 16) / 255)) as Rgb;
  const ok = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(texto);
  if (ok) {
    const [L, C, h] = [Number(ok[1]) / 100, Number(ok[2]), (Number(ok[3]) * Math.PI) / 180];
    return oklabParaLinear([L, C * Math.cos(h), C * Math.sin(h)]).map(limita) as Rgb;
  }
  throw new Error(`Cor não reconhecida: ${valor}`);
}

const luminancia = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Razão de contraste WCAG 2 (1 a 21). */
export function contraste(a: Rgb, b: Rgb): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

export function simular(cor: Rgb, deficiencia: Deficiencia): Rgb {
  return MATRIZES[deficiencia].map((l) => limita(l[0] * cor[0] + l[1] * cor[1] + l[2] * cor[2])) as Rgb;
}

/** Distância perceptual em OKLab (0 = iguais; ~0,02 é a menor diferença notável). */
export function distancia(a: Rgb, b: Rgb): number {
  const [p, q] = [linearParaOklab(a), linearParaOklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Variáveis `--color-*` de um bloco CSS (o primeiro valor de cada uma). */
export function variaveis(css: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const [, nome, valor] of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) resultado[nome] ??= valor.trim();
  return resultado;
}
