import { numeroDoValor, partesDaData, serialDoExcel, valorComoTexto } from './formatacao';
import type { ColunaTabela, TabelaExportavel } from './tipos';
import { criarZip } from './zip';

// Índices de estilo definidos em styles.xml
const ESTILO = { cabecalho: 1, data: 2, dataHora: 3, decimal: 4, inteiro: 5 } as const;

const LARGURA_MINIMA = 10;
const LARGURA_MAXIMA = 60;
const LINHAS_AMOSTRADAS_PARA_LARGURA = 200;

// Caracteres de controle não são permitidos em XML 1.0
// eslint-disable-next-line no-control-regex
const CONTROLE_INVALIDO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function escaparXml(texto: string): string {
  return texto
    .replace(CONTROLE_INVALIDO, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function letraDaColuna(indice: number): string {
  let letras = '';
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
  }
  return letras;
}

// Nome de aba: até 31 caracteres e sem \ / ? * [ ] :
function nomeDaAba(titulo: string): string {
  const limpo = titulo.replace(/[\\/?*[\]:]/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim().slice(0, 31);
  return limpo || 'Relatorio';
}

function celulaDeTexto(referencia: string, texto: string, estilo?: number): string {
  const atributoEstilo = estilo ? ` s="${estilo}"` : '';
  return `<c r="${referencia}"${atributoEstilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
}

function celulaDoValor(referencia: string, valor: unknown, coluna: ColunaTabela): string {
  if (valor === null || valor === undefined || valor === '') return '';

  if (coluna.tipo === 'data' || coluna.tipo === 'data_hora') {
    const partes = partesDaData(valor);
    if (!partes) return '';
    const estilo = coluna.tipo === 'data' ? ESTILO.data : ESTILO.dataHora;
    return `<c r="${referencia}" s="${estilo}"><v>${serialDoExcel(partes)}</v></c>`;
  }

  if (coluna.tipo === 'inteiro' || coluna.tipo === 'decimal') {
    const numero = numeroDoValor(valor);
    if (numero === null) return '';
    const estilo = coluna.tipo === 'inteiro' ? ESTILO.inteiro : ESTILO.decimal;
    return `<c r="${referencia}" s="${estilo}"><v>${numero}</v></c>`;
  }

  // Texto fica como string literal: o Excel nunca o interpreta como fórmula
  return celulaDeTexto(referencia, String(valor));
}

function larguraDaColuna(coluna: ColunaTabela, linhas: Record<string, unknown>[]): number {
  let maior = coluna.titulo.length;
  for (const linha of linhas.slice(0, LINHAS_AMOSTRADAS_PARA_LARGURA)) {
    const tamanho = valorComoTexto(linha[coluna.chave], coluna.tipo).length;
    if (tamanho > maior) maior = tamanho;
  }
  return Math.min(Math.max(maior + 2, LARGURA_MINIMA), LARGURA_MAXIMA);
}

function planilhaXml(tabela: TabelaExportavel): string {
  const ultimaColuna = letraDaColuna(Math.max(tabela.colunas.length - 1, 0));

  const colunasXml = tabela.colunas
    .map((coluna, i) => `<col min="${i + 1}" max="${i + 1}" width="${larguraDaColuna(coluna, tabela.linhas)}" customWidth="1"/>`)
    .join('');

  const cabecalho = tabela.colunas
    .map((coluna, i) => celulaDeTexto(`${letraDaColuna(i)}1`, coluna.titulo, ESTILO.cabecalho))
    .join('');

  const linhasXml = tabela.linhas
    .map((linha, indice) => {
      const numeroDaLinha = indice + 2;
      const celulas = tabela.colunas
        .map((coluna, i) => celulaDoValor(`${letraDaColuna(i)}${numeroDaLinha}`, linha[coluna.chave], coluna))
        .join('');
      return `<row r="${numeroDaLinha}">${celulas}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${colunasXml}</cols>` +
    `<sheetData><row r="1">${cabecalho}</row>${linhasXml}</sheetData>` +
    `<autoFilter ref="A1:${ultimaColuna}1"/>` +
    '</worksheet>'
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const RELACIONAMENTOS_RAIZ =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const RELACIONAMENTOS_PASTA =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

// 0 padrão, 1 cabeçalho, 2 data, 3 data e hora, 4 decimal (#,##0.00), 5 inteiro
const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function pastaDeTrabalhoXml(tabela: TabelaExportavel): string {
  const aba = escaparXml(nomeDaAba(tabela.titulo));
  const ultimaColuna = letraDaColuna(Math.max(tabela.colunas.length - 1, 0));

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${aba}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${aba}'!$A$1:$${ultimaColuna}$1</definedName></definedNames>` +
    '</workbook>'
  );
}

export function gerarXlsx(tabela: TabelaExportavel): Buffer {
  const texto = (conteudo: string) => Buffer.from(conteudo, 'utf8');

  return criarZip([
    { nome: '[Content_Types].xml', conteudo: texto(CONTENT_TYPES) },
    { nome: '_rels/.rels', conteudo: texto(RELACIONAMENTOS_RAIZ) },
    { nome: 'xl/workbook.xml', conteudo: texto(pastaDeTrabalhoXml(tabela)) },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: texto(RELACIONAMENTOS_PASTA) },
    { nome: 'xl/styles.xml', conteudo: texto(ESTILOS) },
    { nome: 'xl/worksheets/sheet1.xml', conteudo: texto(planilhaXml(tabela)) },
  ]);
}
