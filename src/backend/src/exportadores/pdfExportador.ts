import { deflateSync } from 'node:zlib';
import { partesNoFusoLocal, valorComoTexto } from './formatacao';
import { larguraDoTexto, textoHexadecimal } from './pdfFontes';
import type { ColunaTabela, ContextoExportacao, TabelaExportavel } from './tipos';

// A4 em paisagem: os relatórios têm muitas colunas
const LARGURA_PAGINA = 841.89;
const ALTURA_PAGINA = 595.28;
const MARGEM_HORIZONTAL = 36;
const MARGEM_SUPERIOR = 40;
const MARGEM_INFERIOR = 42;

const TAMANHO = { titulo: 16, subtitulo: 9, tabela: 7.5, rodape: 8 };
const ENTRELINHA = 1.25;
const RECUO_X = 3.5;
const RECUO_Y = 3;
const MAX_LINHAS_POR_CELULA = 4;
const LARGURA_MINIMA_COLUNA = 30;
const LARGURA_MAXIMA_NATURAL = 170;
const LINHAS_AMOSTRADAS = 500;
const AMPLIACAO_MAXIMA = 1.6;

const NOME_DO_SISTEMA = 'Gestão de Frotas - FSPH';

interface LinhaDeCelulas {
  celulas: string[][];
  altura: number;
}

interface Pagina {
  linhas: LinhaDeCelulas[];
  inicioDaTabela: number;
}

const alturaDaLinhaDeTexto = (tamanho: number) => tamanho * ENTRELINHA;
const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

function numero(valor: number): string {
  return String(Number(valor.toFixed(2)));
}

// Na leitura em papel, o separador de milhar facilita (1.234,50)
function decimalComMilhar(valor: unknown): string {
  const texto = valorComoTexto(valor, 'decimal');
  if (!texto) return '';
  const [inteiro = '', fracao] = texto.split(',');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fracao}`;
}

function textoDaCelula(valor: unknown, coluna: ColunaTabela): string {
  const texto = coluna.tipo === 'decimal' ? decimalComMilhar(valor) : valorComoTexto(valor, coluna.tipo);
  return texto.replace(/\s+/g, ' ').trim();
}

function ajustarComReticencias(texto: string, largura: number, tamanho: number, negrito: boolean): string {
  const caracteres = Array.from(texto);
  while (caracteres.length > 0 && larguraDoTexto(`${caracteres.join('')}…`, tamanho, negrito) > largura + 0.01) {
    caracteres.pop();
  }
  return `${caracteres.join('')}…`;
}

// Quebra por palavras; palavras maiores que a coluna são quebradas por caractere.
// O que passar de maxLinhas é cortado com reticências.
export function quebrarTexto(
  texto: string,
  largura: number,
  tamanho: number,
  negrito: boolean,
  maxLinhas: number,
): string[] {
  // Tolerância para o arredondamento de ponto flutuante (largura = conteúdo + recuos - recuos)
  const cabe = (parte: string) => larguraDoTexto(parte, tamanho, negrito) <= largura + 0.01;
  const linhas: string[] = [];
  let atual = '';

  for (const palavra of texto.split(' ').filter(Boolean)) {
    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (cabe(candidato)) {
      atual = candidato;
      continue;
    }
    if (atual) {
      linhas.push(atual);
      atual = '';
    }

    let restante = Array.from(palavra);
    while (restante.length > 0 && !cabe(restante.join(''))) {
      let quantos = 1;
      while (quantos < restante.length && cabe(restante.slice(0, quantos + 1).join(''))) quantos++;
      linhas.push(restante.slice(0, quantos).join(''));
      restante = restante.slice(quantos);
    }
    atual = restante.join('');
  }
  if (atual) linhas.push(atual);

  if (linhas.length > maxLinhas) {
    const mantidas = linhas.slice(0, maxLinhas);
    mantidas[maxLinhas - 1] = ajustarComReticencias(mantidas[maxLinhas - 1] ?? '', largura, tamanho, negrito);
    return mantidas;
  }
  return linhas.length > 0 ? linhas : [''];
}

function dataEmTexto(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function textoDoPeriodo(periodo: ContextoExportacao['periodo']): string {
  const { inicio, fim } = periodo ?? {};
  if (inicio && fim) return `Período: ${dataEmTexto(inicio)} a ${dataEmTexto(fim)}`;
  if (inicio) return `Período: a partir de ${dataEmTexto(inicio)}`;
  if (fim) return `Período: até ${dataEmTexto(fim)}`;
  return 'Período: todos os registros';
}

function dataHoraEmTexto(instante: Date): string {
  const p = partesNoFusoLocal(instante);
  return `${doisDigitos(p.dia)}/${doisDigitos(p.mes)}/${p.ano} ${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`;
}

function maiorPalavra(texto: string, negrito: boolean): number {
  return Math.max(0, ...texto.split(' ').map((palavra) => larguraDoTexto(palavra, TAMANHO.tabela, negrito)));
}

// Larguras ajustadas ao conteúdo e à largura útil da página.
// Números e datas nunca encolhem; texto nunca fica menor que a sua maior palavra (evita quebrar no meio
// de "ADMINISTRATIVA" ou de uma placa). Quem absorve o aperto são as colunas de texto longo.
function calcularLarguras(colunas: ColunaTabela[], textos: string[][], larguraUtil: number): number[] {
  const amostra = textos.slice(0, LINHAS_AMOSTRADAS);
  const naturais: number[] = [];
  const minimas: number[] = [];

  colunas.forEach((coluna, indice) => {
    let maiorTexto = larguraDoTexto(coluna.titulo, TAMANHO.tabela, true);
    let maiorToken = maiorPalavra(coluna.titulo, true);
    for (const linha of amostra) {
      const conteudo = linha[indice] ?? '';
      maiorTexto = Math.max(maiorTexto, larguraDoTexto(conteudo, TAMANHO.tabela));
      maiorToken = Math.max(maiorToken, maiorPalavra(conteudo, false));
    }

    const natural = Math.min(Math.max(maiorTexto + 2 * RECUO_X, LARGURA_MINIMA_COLUNA), LARGURA_MAXIMA_NATURAL);
    const rigida = coluna.tipo !== 'texto';
    naturais.push(natural);
    minimas.push(rigida ? natural : Math.min(natural, Math.max(maiorToken + 2 * RECUO_X, LARGURA_MINIMA_COLUNA)));
  });

  const soma = (valores: number[]) => valores.reduce((total, valor) => total + valor, 0);
  const somaNaturais = soma(naturais);

  if (somaNaturais <= larguraUtil) {
    const fator = Math.min(larguraUtil / somaNaturais, AMPLIACAO_MAXIMA);
    return naturais.map((largura) => largura * fator);
  }

  const excesso = somaNaturais - larguraUtil;
  const elasticidades = naturais.map((natural, indice) => natural - (minimas[indice] ?? natural));
  const totalElastico = soma(elasticidades);

  if (totalElastico >= excesso) {
    return naturais.map((natural, indice) => natural - (elasticidades[indice] ?? 0) * (excesso / totalElastico));
  }

  // Nem no mínimo cabe: reduz tudo na mesma proporção (último recurso)
  const somaMinimas = soma(minimas);
  return minimas.map((largura) => largura * (larguraUtil / somaMinimas));
}

function organizarPaginas(linhas: LinhaDeCelulas[], alturaCabecalhoTabela: number, topoPrimeira: number): Pagina[] {
  const limiteInferior = MARGEM_INFERIOR;
  const topoDemais = ALTURA_PAGINA - MARGEM_SUPERIOR - alturaDaLinhaDeTexto(TAMANHO.subtitulo) - 6;
  const paginas: Pagina[] = [{ linhas: [], inicioDaTabela: topoPrimeira }];
  let y = topoPrimeira - alturaCabecalhoTabela;

  for (const linha of linhas) {
    if (y - linha.altura < limiteInferior && (paginas[paginas.length - 1]?.linhas.length ?? 0) > 0) {
      paginas.push({ linhas: [], inicioDaTabela: topoDemais });
      y = topoDemais - alturaCabecalhoTabela;
    }
    paginas[paginas.length - 1]?.linhas.push(linha);
    y -= linha.altura;
  }
  return paginas;
}

function texto(x: number, y: number, conteudo: string, tamanho: number, negrito = false, cinza = 0): string {
  if (!conteudo) return '';
  return `BT ${cinza} g /${negrito ? 'F2' : 'F1'} ${tamanho} Tf ${numero(x)} ${numero(y)} Td ${textoHexadecimal(conteudo)} Tj ET`;
}

function retangulo(x: number, y: number, largura: number, altura: number, r: number, g: number, b: number): string {
  return `${r} ${g} ${b} rg ${numero(x)} ${numero(y)} ${numero(largura)} ${numero(altura)} re f`;
}

function linhaHorizontal(x1: number, x2: number, y: number): string {
  return `0.8 G 0.4 w ${numero(x1)} ${numero(y)} m ${numero(x2)} ${numero(y)} l S`;
}

interface Estrutura {
  colunas: ColunaTabela[];
  larguras: number[];
  cabecalho: string[][];
  alturaCabecalho: number;
}

function desenharLinha(
  celulas: string[][],
  altura: number,
  topo: number,
  estrutura: Estrutura,
  negrito: boolean,
): string[] {
  const operacoes: string[] = [];
  let x = MARGEM_HORIZONTAL;

  estrutura.colunas.forEach((coluna, indice) => {
    const largura = estrutura.larguras[indice] ?? 0;
    const alinharADireita = coluna.tipo === 'inteiro' || coluna.tipo === 'decimal';

    (celulas[indice] ?? []).forEach((parte, numeroDaLinha) => {
      const base = topo - RECUO_Y - TAMANHO.tabela * 0.85 - numeroDaLinha * alturaDaLinhaDeTexto(TAMANHO.tabela);
      const posicaoX = alinharADireita
        ? x + largura - RECUO_X - larguraDoTexto(parte, TAMANHO.tabela, negrito)
        : x + RECUO_X;
      operacoes.push(texto(posicaoX, base, parte, TAMANHO.tabela, negrito));
    });
    x += largura;
  });

  operacoes.push(linhaHorizontal(MARGEM_HORIZONTAL, x, topo - altura));
  return operacoes;
}

function conteudoDaPagina(
  indice: number,
  total: number,
  pagina: Pagina,
  estrutura: Estrutura,
  tabela: TabelaExportavel,
  cabecalhoPrimeiraPagina: string[],
  semRegistros: boolean,
): string {
  const operacoes: string[] = [];
  const larguraTotal = estrutura.larguras.reduce((soma, largura) => soma + largura, 0);

  if (indice === 0) {
    let y = ALTURA_PAGINA - MARGEM_SUPERIOR;
    operacoes.push(texto(MARGEM_HORIZONTAL, y - TAMANHO.titulo * 0.8, `Relatório de ${tabela.titulo}`, TAMANHO.titulo, true));
    y -= TAMANHO.titulo * 1.5;
    for (const linha of cabecalhoPrimeiraPagina) {
      operacoes.push(texto(MARGEM_HORIZONTAL, y - TAMANHO.subtitulo * 0.8, linha, TAMANHO.subtitulo, false, 0.25));
      y -= alturaDaLinhaDeTexto(TAMANHO.subtitulo) + 1;
    }
  } else {
    operacoes.push(
      texto(
        MARGEM_HORIZONTAL,
        ALTURA_PAGINA - MARGEM_SUPERIOR - TAMANHO.subtitulo * 0.8,
        `Relatório de ${tabela.titulo} (continuação)`,
        TAMANHO.subtitulo,
        true,
        0.25,
      ),
    );
  }

  // Cabeçalho da tabela, repetido em todas as páginas
  let topo = pagina.inicioDaTabela;
  operacoes.push(retangulo(MARGEM_HORIZONTAL, topo - estrutura.alturaCabecalho, larguraTotal, estrutura.alturaCabecalho, 0.86, 0.89, 0.95));
  operacoes.push(...desenharLinha(estrutura.cabecalho, estrutura.alturaCabecalho, topo, estrutura, true));
  topo -= estrutura.alturaCabecalho;

  pagina.linhas.forEach((linha, posicao) => {
    if (posicao % 2 === 1) {
      operacoes.push(retangulo(MARGEM_HORIZONTAL, topo - linha.altura, larguraTotal, linha.altura, 0.965, 0.965, 0.97));
    }
    operacoes.push(...desenharLinha(linha.celulas, linha.altura, topo, estrutura, false));
    topo -= linha.altura;
  });

  if (semRegistros) {
    operacoes.push(
      texto(MARGEM_HORIZONTAL + RECUO_X, topo - 16, 'Nenhum registro encontrado para os filtros informados.', TAMANHO.subtitulo, false, 0.35),
    );
  }

  // Rodapé
  const rodape = `Página ${indice + 1} de ${total}`;
  const yRodape = MARGEM_INFERIOR - 22;
  operacoes.push(texto(MARGEM_HORIZONTAL, yRodape, `${NOME_DO_SISTEMA} - ${tabela.titulo}`, TAMANHO.rodape, false, 0.45));
  operacoes.push(
    texto(LARGURA_PAGINA - MARGEM_HORIZONTAL - larguraDoTexto(rodape, TAMANHO.rodape), yRodape, rodape, TAMANHO.rodape, false, 0.45),
  );

  return operacoes.filter(Boolean).join('\n');
}

function paraUtf16Hexadecimal(texto: string): string {
  const bytes = Buffer.from(`\uFEFF${texto}`, 'utf16le').swap16();
  return `<${bytes.toString('hex').toUpperCase()}>`;
}

function dataDoPdf(instante: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `D:${instante.getUTCFullYear()}${p(instante.getUTCMonth() + 1)}${p(instante.getUTCDate())}` +
    `${p(instante.getUTCHours())}${p(instante.getUTCMinutes())}${p(instante.getUTCSeconds())}Z`
  );
}

export function gerarPdf(tabela: TabelaExportavel, contexto: ContextoExportacao = {}): Buffer {
  const geradoEm = contexto.geradoEm ?? new Date();
  const selecionadas = tabela.colunasPdf
    ? tabela.colunas.filter((coluna) => tabela.colunasPdf?.includes(coluna.chave))
    : tabela.colunas;
  const colunas = selecionadas.length > 0 ? selecionadas : tabela.colunas;

  const textos = tabela.linhas.map((linha) => colunas.map((coluna) => textoDaCelula(linha[coluna.chave], coluna)));
  const larguraUtil = LARGURA_PAGINA - 2 * MARGEM_HORIZONTAL;
  const larguras = calcularLarguras(colunas, textos, larguraUtil);
  const espacoUtil = (indice: number) => Math.max((larguras[indice] ?? 0) - 2 * RECUO_X, 1);

  const cabecalho = colunas.map((coluna, indice) =>
    quebrarTexto(coluna.titulo, espacoUtil(indice), TAMANHO.tabela, true, 3),
  );
  const altura = (celulas: string[][]) =>
    Math.max(...celulas.map((partes) => partes.length), 1) * alturaDaLinhaDeTexto(TAMANHO.tabela) + 2 * RECUO_Y;

  const linhas: LinhaDeCelulas[] = textos.map((linha) => {
    const celulas = linha.map((conteudo, indice) =>
      quebrarTexto(conteudo, espacoUtil(indice), TAMANHO.tabela, false, MAX_LINHAS_POR_CELULA),
    );
    return { celulas, altura: altura(celulas) };
  });

  const linhasDoCabecalho = [
    textoDoPeriodo(contexto.periodo),
    ...(tabela.notas ?? []),
    `Total de registros: ${tabela.linhas.length}`,
    `Gerado em ${dataHoraEmTexto(geradoEm)} (horário de Brasília)`,
  ];
  const topoPrimeira =
    ALTURA_PAGINA -
    MARGEM_SUPERIOR -
    TAMANHO.titulo * 1.5 -
    linhasDoCabecalho.length * (alturaDaLinhaDeTexto(TAMANHO.subtitulo) + 1) -
    8;

  const estrutura: Estrutura = { colunas, larguras, cabecalho, alturaCabecalho: altura(cabecalho) };
  const paginas = organizarPaginas(linhas, estrutura.alturaCabecalho, topoPrimeira);
  const semRegistros = linhas.length === 0;

  // Objetos: 1 catálogo, 2 páginas, 3 e 4 fontes, 5 informações; depois (conteúdo, página) de cada página
  const objetos: Buffer[] = [];
  const texto8 = (conteudo: string) => Buffer.from(conteudo, 'latin1');
  const idDaPagina = (indice: number) => 7 + indice * 2;

  objetos.push(texto8('<< /Type /Catalog /Pages 2 0 R >>'));
  objetos.push(
    texto8(`<< /Type /Pages /Kids [${paginas.map((_, i) => `${idDaPagina(i)} 0 R`).join(' ')}] /Count ${paginas.length} >>`),
  );
  objetos.push(texto8('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  objetos.push(texto8('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  objetos.push(
    texto8(
      `<< /Title ${paraUtf16Hexadecimal(`Relatório de ${tabela.titulo}`)} /Producer (Gestao de Frotas FSPH) ` +
        `/CreationDate (${dataDoPdf(geradoEm)}) >>`,
    ),
  );

  paginas.forEach((pagina, indice) => {
    const fluxo = deflateSync(
      Buffer.from(
        conteudoDaPagina(indice, paginas.length, pagina, estrutura, tabela, linhasDoCabecalho, semRegistros),
        'latin1',
      ),
    );
    objetos.push(Buffer.concat([texto8(`<< /Length ${fluxo.length} /Filter /FlateDecode >>\nstream\n`), fluxo, texto8('\nendstream')]));
    objetos.push(
      texto8(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA_PAGINA} ${ALTURA_PAGINA}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idDaPagina(indice) - 1} 0 R >>`,
      ),
    );
  });

  const partes: Buffer[] = [Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  const deslocamentos: number[] = [];
  let posicao = partes[0]?.length ?? 0;

  objetos.forEach((corpo, indice) => {
    deslocamentos.push(posicao);
    const objeto = Buffer.concat([texto8(`${indice + 1} 0 obj\n`), corpo, texto8('\nendobj\n')]);
    partes.push(objeto);
    posicao += objeto.length;
  });

  const referencias =
    `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
    deslocamentos.map((deslocamento) => `${String(deslocamento).padStart(10, '0')} 00000 n \n`).join('');
  partes.push(
    texto8(`${referencias}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${posicao}\n%%EOF\n`),
  );

  return Buffer.concat(partes);
}
