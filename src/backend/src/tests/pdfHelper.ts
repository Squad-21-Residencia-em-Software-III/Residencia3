import { inflateSync } from 'node:zlib';

// Textos desenhados em cada página: um item por operação de texto (célula, linha de cabeçalho, rodapé)
export function textosPorPagina(pdf: Buffer): string[][] {
  const bruto = pdf.toString('latin1');
  const paginas: string[][] = [];

  for (const fluxo of bruto.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const conteudo = inflateSync(Buffer.from(fluxo[1] ?? '', 'latin1')).toString('latin1');
    const textos = [...conteudo.matchAll(/<([0-9A-F]*)> Tj/g)].map((operacao) =>
      Buffer.from(operacao[1] ?? '', 'hex').toString('latin1'),
    );
    paginas.push(textos);
  }

  return paginas;
}

export function textoDoPdf(pdf: Buffer): string {
  return textosPorPagina(pdf)
    .map((textos) => textos.join('\n'))
    .join('\n');
}
