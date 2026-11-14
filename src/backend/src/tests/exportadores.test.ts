import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { gerarCsv } from '../exportadores/csvExportador';
import { hojeNoFusoLocal, valorComoTexto } from '../exportadores/formatacao';
import type { TabelaExportavel } from '../exportadores/tipos';
import { crc32 } from '../exportadores/zip';
import { gerarXlsx } from '../exportadores/xlsxExportador';

const tabela: TabelaExportavel = {
  titulo: 'Abastecimentos',
  colunas: [
    { chave: 'id', titulo: 'ID', tipo: 'inteiro' },
    { chave: 'data', titulo: 'Data', tipo: 'data' },
    { chave: 'saida', titulo: 'Saída', tipo: 'data_hora' },
    { chave: 'posto', titulo: 'Posto', tipo: 'texto' },
    { chave: 'valor', titulo: 'Valor (R$)', tipo: 'decimal' },
  ],
  linhas: [
    { id: 1, data: '2026-11-13', saida: new Date('2026-11-13T02:30:00Z'), posto: 'Posto "Centro"; Aracaju', valor: '1234.5' },
    { id: 2, data: null, saida: null, posto: '=HYPERLINK("http://x","clique")', valor: null },
  ],
};

// Lê as entradas de um ZIP pelo diretório central (suficiente para conferir o .xlsx)
function lerZip(zip: Buffer): Record<string, string> {
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = zip.readUInt16LE(fim + 10);
  let posicao = zip.readUInt32LE(fim + 16);
  const arquivos: Record<string, string> = {};

  for (let i = 0; i < total; i++) {
    const tamanhoNome = zip.readUInt16LE(posicao + 28);
    const deslocamento = zip.readUInt32LE(posicao + 42);
    const nome = zip.subarray(posicao + 46, posicao + 46 + tamanhoNome).toString('utf8');
    const tamanhoComprimido = zip.readUInt32LE(deslocamento + 18);
    const tamanhoNomeLocal = zip.readUInt16LE(deslocamento + 26);
    const inicio = deslocamento + 30 + tamanhoNomeLocal;
    const dados = inflateRawSync(zip.subarray(inicio, inicio + tamanhoComprimido));

    expect(crc32(dados)).toBe(zip.readUInt32LE(posicao + 16));
    arquivos[nome] = dados.toString('utf8');
    posicao += 46 + tamanhoNome + zip.readUInt16LE(posicao + 30) + zip.readUInt16LE(posicao + 32);
  }

  return arquivos;
}

describe('formatação de valores', () => {
  it('formata data, data e hora (no fuso de Brasília), inteiro e decimal no padrão brasileiro', () => {
    expect(valorComoTexto('2026-11-13', 'data')).toBe('13/11/2026');
    expect(valorComoTexto(new Date('2026-11-13T02:30:00Z'), 'data_hora')).toBe('12/11/2026 23:30');
    expect(valorComoTexto('2026-02-28T23:59:00-03:00', 'data_hora')).toBe('28/02/2026 23:59');
    expect(valorComoTexto('1500', 'inteiro')).toBe('1500');
    expect(valorComoTexto('1234.5', 'decimal')).toBe('1234,50');
  });

  it('retorna texto vazio para valores ausentes ou inválidos', () => {
    expect(valorComoTexto(null, 'texto')).toBe('');
    expect(valorComoTexto(undefined, 'decimal')).toBe('');
    expect(valorComoTexto('abc', 'decimal')).toBe('');
    expect(valorComoTexto('data inválida', 'data_hora')).toBe('');
  });

  it('gera a data de hoje no formato do nome do arquivo', () => {
    expect(hojeNoFusoLocal(new Date('2026-11-14T02:00:00Z'))).toBe('2026-11-13');
  });
});

describe('gerarCsv', () => {
  const texto = gerarCsv(tabela).toString('utf8');

  it('usa UTF-8 com BOM, separador ponto e vírgula e quebra de linha CRLF', () => {
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    expect(texto.slice(1).split('\r\n')[0]).toBe('ID;Data;Saída;Posto;Valor (R$)');
  });

  it('formata as células e protege aspas e separadores', () => {
    expect(texto).toContain('1;13/11/2026;12/11/2026 23:30;"Posto ""Centro""; Aracaju";1234,50');
  });

  it('neutraliza texto que o Excel interpretaria como fórmula', () => {
    expect(texto).toContain(`2;;;"'=HYPERLINK(""http://x"",""clique"")";`);
  });

  it('mantém números negativos como números', () => {
    const csv = gerarCsv({
      titulo: 'T',
      colunas: [{ chave: 'v', titulo: 'V', tipo: 'decimal' }],
      linhas: [{ v: '-5' }],
    }).toString('utf8');

    expect(csv).toContain('\r\n-5,00\r\n');
  });

  it('gera apenas o cabeçalho quando não há linhas', () => {
    expect(gerarCsv({ ...tabela, linhas: [] }).toString('utf8').slice(1)).toBe('ID;Data;Saída;Posto;Valor (R$)\r\n');
  });
});

describe('gerarXlsx', () => {
  const arquivos = lerZip(gerarXlsx(tabela));

  it('gera os arquivos exigidos por um pacote .xlsx', () => {
    expect(Object.keys(arquivos).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ].sort(),
    );
  });

  it('grava números e datas como valores tipados e texto como texto literal', () => {
    const planilha = arquivos['xl/worksheets/sheet1.xml'] as string;

    expect(planilha).toContain('<c r="A2" s="5"><v>1</v></c>');
    expect(planilha).toContain('<c r="B2" s="2"><v>46339</v></c>'); // 13/11/2026
    expect(planilha).toContain('<c r="C2" s="3"><v>46338.97916666667</v></c>'); // 12/11/2026 23:30
    expect(planilha).toContain('<c r="E2" s="4"><v>1234.5</v></c>');
    // fórmula maliciosa permanece texto
    expect(planilha).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;,&quot;clique&quot;)</t></is></c>');
  });

  it('omite células vazias, congela o cabeçalho e aplica filtro', () => {
    const planilha = arquivos['xl/worksheets/sheet1.xml'] as string;

    expect(planilha).not.toContain('r="B3"');
    expect(planilha).toContain('state="frozen"');
    expect(planilha).toContain('<autoFilter ref="A1:E1"/>');
  });

  it('remove caracteres inválidos em XML e ajusta o nome da aba', () => {
    const resultado = lerZip(
      gerarXlsx({
        titulo: 'Relatório: viagens/2026?',
        colunas: [{ chave: 'a', titulo: 'A', tipo: 'texto' }],
        linhas: [{ a: 'x\u0007<y>&' }],
      }),
    );

    expect(resultado['xl/workbook.xml']).toContain('name="Relatório viagens 2026"');
    expect(resultado['xl/worksheets/sheet1.xml']).toContain('>x&lt;y&gt;&amp;</t>');
  });
});
