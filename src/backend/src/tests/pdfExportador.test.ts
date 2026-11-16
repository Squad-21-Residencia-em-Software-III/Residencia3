import { describe, expect, it } from 'vitest';

import { gerarPdf, quebrarTexto } from '../exportadores/pdfExportador';
import type { TabelaExportavel } from '../exportadores/tipos';
import { textoDoPdf, textosPorPagina } from './pdfHelper';

const geradoEm = new Date('2026-11-14T20:40:00Z'); // 17:40 em Brasília

const tabela: TabelaExportavel = {
  titulo: 'Abastecimentos',
  colunas: [
    { chave: 'id', titulo: 'ID', tipo: 'inteiro' },
    { chave: 'data', titulo: 'Data', tipo: 'data' },
    { chave: 'motorista', titulo: 'Motorista', tipo: 'texto' },
    { chave: 'valor', titulo: 'Valor total (R$)', tipo: 'decimal' },
  ],
  linhas: [
    { id: 1, data: '2026-11-12', motorista: 'João da Conceição', valor: '1234567.5' },
    { id: 2, data: '2026-11-13', motorista: 'Maria Aparecida', valor: null },
  ],
};

const maisLinhas = (quantidade: number): TabelaExportavel => ({
  ...tabela,
  linhas: Array.from({ length: quantidade }, (_, i) => ({
    id: i + 1,
    data: '2026-11-12',
    motorista: `Motorista ${i + 1}`,
    valor: '10',
  })),
});

describe('gerarPdf — estrutura do arquivo', () => {
  const pdf = gerarPdf(tabela, { geradoEm });
  const bruto = pdf.toString('latin1');

  it('tem cabeçalho e fim de arquivo de um PDF', () => {
    expect(bruto.startsWith('%PDF-1.4')).toBe(true);
    expect(bruto.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('tem tabela de referências cruzadas com os deslocamentos corretos', () => {
    const inicio = Number(/startxref\n(\d+)\n%%EOF/.exec(bruto)?.[1]);
    expect(bruto.slice(inicio, inicio + 4)).toBe('xref');

    const entradas = [...bruto.slice(inicio).matchAll(/^(\d{10}) 00000 n $/gm)];
    expect(entradas.length).toBeGreaterThan(0);

    entradas.forEach((entrada, indice) => {
      const deslocamento = Number(entrada[1]);
      expect(bruto.slice(deslocamento, deslocamento + `${indice + 1} 0 obj`.length)).toBe(`${indice + 1} 0 obj`);
    });
  });

  it('declara a quantidade de páginas e as fontes com codificação WinAnsi', () => {
    expect(bruto).toContain('/Count 1');
    expect(bruto).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding');
    expect(bruto).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(bruto).toContain('/MediaBox [0 0 841.89 595.28]');
  });
});

describe('gerarPdf — conteúdo', () => {
  const texto = textoDoPdf(gerarPdf(tabela, { periodo: { inicio: '2026-11-01', fim: '2026-11-13' }, geradoEm }));

  it('traz título, período, total e data de geração no horário de Brasília', () => {
    expect(texto).toContain('Relatório de Abastecimentos');
    expect(texto).toContain('Período: 01/11/2026 a 13/11/2026');
    expect(texto).toContain('Total de registros: 2');
    expect(texto).toContain('Gerado em 14/11/2026 17:40 (horário de Brasília)');
  });

  it('formata as células e preserva a acentuação', () => {
    expect(texto).toContain('João da Conceição');
    expect(texto).toContain('12/11/2026');
    expect(texto).toContain('1.234.567,50');
  });

  it('descreve períodos abertos e a ausência de período', () => {
    expect(textoDoPdf(gerarPdf(tabela, { periodo: { inicio: '2026-11-01' }, geradoEm }))).toContain(
      'Período: a partir de 01/11/2026',
    );
    expect(textoDoPdf(gerarPdf(tabela, { periodo: { fim: '2026-11-13' }, geradoEm }))).toContain(
      'Período: até 13/11/2026',
    );
    expect(textoDoPdf(gerarPdf(tabela, { geradoEm }))).toContain('Período: todos os registros');
  });

  it('imprime as notas do relatório no cabeçalho', () => {
    const comNota = textoDoPdf(gerarPdf({ ...tabela, notas: ['Escopo: viagens administrativas'] }, { geradoEm }));

    expect(comNota).toContain('Escopo: viagens administrativas');
  });

  it('usa somente as colunas indicadas em colunasPdf', () => {
    const resumido = textoDoPdf(gerarPdf({ ...tabela, colunasPdf: ['id', 'motorista'] }, { geradoEm }));

    expect(resumido).toContain('Motorista');
    expect(resumido).not.toContain('Valor total (R$)');
    expect(resumido).not.toContain('12/11/2026');
  });

  it('mostra mensagem quando não há registros', () => {
    const vazio = textoDoPdf(gerarPdf({ ...tabela, linhas: [] }, { geradoEm }));

    expect(vazio).toContain('Total de registros: 0');
    expect(vazio).toContain('Nenhum registro encontrado para os filtros informados.');
  });

  it('substitui por ? o que a codificação WinAnsi não cobre, sem falhar', () => {
    const resultado = textoDoPdf(
      gerarPdf({ ...tabela, linhas: [{ id: 1, data: null, motorista: 'Ana 😀 中 (x) \\ y', valor: null }] }, { geradoEm }),
    );

    expect(resultado).toContain('Ana ? ?');
    expect(resultado).toContain('(x) \\ y');
  });
});

describe('gerarPdf — paginação', () => {
  const paginas = textosPorPagina(gerarPdf(maisLinhas(200), { geradoEm }));

  it('divide os registros em várias páginas, com numeração', () => {
    expect(paginas.length).toBeGreaterThan(1);
    paginas.forEach((textos, indice) => {
      expect(textos).toContain(`Página ${indice + 1} de ${paginas.length}`);
    });
  });

  it('repete o cabeçalho da tabela em todas as páginas e marca a continuação', () => {
    paginas.forEach((textos) => expect(textos).toContain('Motorista'));
    expect(paginas[0]).toContain('Relatório de Abastecimentos');
    expect(paginas[1]).toContain('Relatório de Abastecimentos (continuação)');
  });

  it('não perde nem duplica registros', () => {
    const motoristas = paginas.flat().filter((texto) => /^Motorista \d+$/.test(texto));

    expect(motoristas).toHaveLength(200);
    expect(new Set(motoristas).size).toBe(200);
  });
});

describe('gerarPdf — largura das colunas', () => {
  const doze: TabelaExportavel = {
    titulo: 'Viagens',
    colunas: [
      { chave: 'id', titulo: 'ID', tipo: 'inteiro' },
      { chave: 'tipo', titulo: 'Tipo', tipo: 'texto' },
      { chave: 'status', titulo: 'Status', tipo: 'texto' },
      { chave: 'origem', titulo: 'Origem', tipo: 'texto' },
      { chave: 'destino', titulo: 'Destino', tipo: 'texto' },
      { chave: 'placa', titulo: 'Placa', tipo: 'texto' },
      { chave: 'motorista', titulo: 'Motorista', tipo: 'texto' },
      { chave: 'inicio', titulo: 'Início previsto', tipo: 'data_hora' },
      { chave: 'saida', titulo: 'Saída efetiva', tipo: 'data_hora' },
      { chave: 'chegada', titulo: 'Chegada efetiva', tipo: 'data_hora' },
      { chave: 'km_inicial', titulo: 'Km inicial', tipo: 'inteiro' },
      { chave: 'km_final', titulo: 'Km final', tipo: 'inteiro' },
    ],
    linhas: Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      tipo: 'ADMINISTRATIVA',
      status: 'EM_ANDAMENTO',
      origem: 'Sede da FSPH - Rua Campo do Brito, 551, bairro São José',
      destino: 'Hospital de Urgência de Sergipe Governador João Alves Filho',
      placa: 'QWE4R56',
      motorista: 'Antônio José Ferreira',
      inicio: new Date('2026-11-10T11:00:00Z'),
      saida: new Date('2026-11-10T11:12:00Z'),
      chegada: null,
      km_inicial: 45000 + i,
      km_final: 45120 + i,
    })),
  };
  const textos = textosPorPagina(gerarPdf(doze, { geradoEm })).flat();

  it('não quebra no meio palavras curtas, números nem datas', () => {
    for (const inteiro of ['ADMINISTRATIVA', 'EM_ANDAMENTO', 'QWE4R56', '10/11/2026 08:00', '10/11/2026 08:12', '45000', '45120']) {
      expect(textos).toContain(inteiro);
    }
  });

  it('quebra em linhas os textos longos, em vez de cortá-los', () => {
    expect(textos.some((texto) => texto.startsWith('Hospital de Urgência'))).toBe(true);
    expect(textos.join(' ')).toContain('Alves Filho');
  });
});

describe('quebrarTexto', () => {
  const quebrar = (texto: string, largura: number, maximo = 4) => quebrarTexto(texto, largura, 7.5, false, maximo);

  it('mantém em uma linha o que cabe', () => {
    expect(quebrar('Posto Central', 200)).toEqual(['Posto Central']);
  });

  it('quebra por palavras quando não cabe', () => {
    const linhas = quebrar('Hospital de Urgência de Sergipe Governador João Alves Filho', 90);

    expect(linhas.length).toBeGreaterThan(1);
    expect(linhas.join(' ')).toBe('Hospital de Urgência de Sergipe Governador João Alves Filho');
  });

  it('quebra por caractere a palavra maior que a coluna, sem perder letras', () => {
    const linhas = quebrar('x'.repeat(100), 40, 10);

    expect(linhas.length).toBeGreaterThan(1);
    expect(linhas.join('')).toBe('x'.repeat(100));
  });

  it('corta com reticências o que passa do máximo de linhas', () => {
    const linhas = quebrar('palavra '.repeat(60), 60, 2);

    expect(linhas).toHaveLength(2);
    expect(linhas[1]?.endsWith('…')).toBe(true);
  });

  it('devolve uma linha vazia para texto vazio', () => {
    expect(quebrar('', 50)).toEqual(['']);
  });
});
