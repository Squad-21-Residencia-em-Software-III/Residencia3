// Métricas das fontes padrão do PDF (Helvetica e Helvetica-Bold), em milésimos de em.
// Valem para os códigos 32 a 255 da codificação WinAnsi (Windows-1252), a mesma usada no PDF.

const LARGURAS_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761,
  556, 556, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 556, 611, 556,
  556, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 556, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
];

const LARGURAS_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761,
  556, 611, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 611, 611, 611,
  611, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 611, 500, 667,
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
  611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
];

// Pontos de código Unicode dos bytes 0x80 a 0x9F do Windows-1252 (0 = sem caractere)
const CP1252_ALTO = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

const POR_UNICODE = new Map<number, number>();
CP1252_ALTO.forEach((unicode, indice) => {
  if (unicode !== 0) POR_UNICODE.set(unicode, 0x80 + indice);
});

const SUBSTITUTO = 0x3f; // '?'

// Byte WinAnsi do caractere; o que a codificação não cobre vira '?'
export function codigoWinAnsi(caractere: string): number {
  const ponto = caractere.codePointAt(0) ?? SUBSTITUTO;
  if (ponto >= 0x20 && ponto <= 0x7e) return ponto;
  if (ponto >= 0xa0 && ponto <= 0xff) return ponto;
  return POR_UNICODE.get(ponto) ?? SUBSTITUTO;
}

// Largura do texto, em pontos, para o tamanho de fonte informado
export function larguraDoTexto(texto: string, tamanho: number, negrito = false): number {
  const tabela = negrito ? LARGURAS_NEGRITO : LARGURAS_NORMAL;
  let total = 0;
  for (const caractere of texto) {
    total += tabela[codigoWinAnsi(caractere) - 32] ?? 0;
  }
  return (total * tamanho) / 1000;
}

// Texto como string hexadecimal do PDF (<...>), já convertido para WinAnsi
export function textoHexadecimal(texto: string): string {
  let hex = '';
  for (const caractere of texto) {
    hex += codigoWinAnsi(caractere).toString(16).padStart(2, '0').toUpperCase();
  }
  return `<${hex}>`;
}
