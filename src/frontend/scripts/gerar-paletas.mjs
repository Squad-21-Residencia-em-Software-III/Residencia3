// Gera src/styles/paletas.css (SCRUM-307): paletas para protanopia, deuteranopia e tritanopia.
// Cada categoria de status (sucesso, erro, aviso, informação, roxo) troca de matiz e mantém a claridade do Tailwind,
// por isso o contraste dos textos continua parecido. Só os tons fortes (500 em diante e os tokens de texto)
// podem ganhar um ajuste de claridade, para separar categorias que a deficiência aproxima.
// Rodar depois de mudar as cores: `node scripts/gerar-paletas.mjs`. Validação: src/styles/paletas.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temaTailwind = fs.readFileSync(path.join(raiz, 'node_modules/tailwindcss/theme.css'), 'utf8');
const cssGlobal = fs.readFileSync(path.join(raiz, 'src/styles/global.css'), 'utf8');

const FAMILIAS = {
  sucesso: ['green', 'emerald', 'teal'],
  erro: ['red', 'rose'],
  aviso: ['amber', 'yellow', 'orange'],
  info: ['blue', 'sky'],
  roxo: ['violet', 'purple'],
};
const TOKENS = {
  sucesso: { success: true, 'success-bg': false },
  erro: { danger: true, 'danger-strong': true, 'danger-bg': false, 'danger-soft': false },
  aviso: { warning: true, 'warning-bg': false },
  info: { info: true, 'info-bg': false },
  roxo: { purple: true, 'purple-bg': false },
};
// Por categoria: [matiz OKLCH, ajuste de claridade dos tons fortes]. Valores escolhidos por busca: o maior
// afastamento entre as cinco categorias, vistas com a deficiência, mantendo contraste ≥ 4,6:1 e cada categoria
// numa faixa de matiz coerente (sucesso verde a azul, erro vermelho, aviso laranja, informação azul a violeta).
const PALETAS = [
  {
    paletas: ['protanopia', 'deuteranopia'],
    sucesso: [245, 0],
    erro: [0, -0.12],
    aviso: [45, -0.06],
    info: [230, -0.06],
    roxo: [270, -0.12],
  },
  {
    paletas: ['tritanopia'],
    sucesso: [165, 0],
    erro: [15, 0.03],
    aviso: [45, -0.12],
    info: [300, 0.03],
    roxo: [285, -0.12],
  },
];

// --- cor ---
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const limita = (x) => Math.min(1, Math.max(0, x));
function oklabParaLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function linearParaOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const paraLab = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
/** Reduz a croma até caber em sRGB, mantendo claridade e matiz. */
function caber([L, C, h]) {
  let c = C;
  for (let i = 0; i < 80 && c > 0; i += 1) {
    if (oklabParaLinear(paraLab([L, c, h])).every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return [L, c, h];
    c *= 0.95;
  }
  return [L, 0, h];
}
function hexParaOklch(hex) {
  const [L, a, b] = linearParaOklab([1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)));
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h];
}
const oklch = ([L, C, h]) => `oklch(${(limita(L) * 100).toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})`;

// --- entradas ---
const tailwind = {};
for (const [, nome, L, C, H] of temaTailwind.matchAll(/--color-([a-z]+)-(\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)
  .map((m) => [m[0], `${m[1]}-${m[2]}`, m[3], m[4], m[5]])) {
  tailwind[nome] = [Number(L) / 100, Number(C), Number(H)];
}
const tokens = {};
for (const [, nome, hex] of cssGlobal.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)) tokens[nome] = hexParaOklch(hex);

function blocos() {
  return PALETAS.map(({ paletas, ...categorias }) => {
    const linhas = [];
    for (const [categoria, [matiz, ajuste]] of Object.entries(categorias)) {
      for (const familia of FAMILIAS[categoria]) {
        for (const [nome, [L, C]] of Object.entries(tailwind)) {
          if (!nome.startsWith(`${familia}-`)) continue;
          const forte = Number(nome.split('-')[1]) >= 500;
          linhas.push(`  --color-${nome}: ${oklch(caber([L + (forte ? ajuste : 0), C, matiz]))};`);
        }
      }
      for (const [token, forte] of Object.entries(TOKENS[categoria])) {
        const [L, C] = tokens[token];
        linhas.push(`  --color-${token}: ${oklch(caber([L + (forte ? ajuste : 0), C, matiz]))};`);
      }
    }
    const seletores = paletas.map((paleta) => `:root[data-paleta='${paleta}']`).join(',\n');
    return `${seletores} {\n${linhas.join('\n')}\n}`;
  });
}

const saida = `/*
 * GERADO por scripts/gerar-paletas.mjs (SCRUM-307). Não editar à mão.
 * Redefine as variáveis de cor dos status (Tailwind e tokens do projeto) quando a pessoa escolhe uma paleta.
 * Nenhum filtro é aplicado à página: fotos do odômetro, documentos e mapas-base ficam com as cores reais.
 */

${blocos().join('\n\n')}
`;
fs.writeFileSync(path.join(raiz, 'src/styles/paletas.css'), saida);
console.log(`paletas.css gerado (${saida.length} bytes)`);
