import { deflateRawSync } from 'node:zlib';

export interface ArquivoZip {
  nome: string;
  conteudo: Buffer;
}

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

export function crc32(dados: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of dados) crc = (TABELA_CRC[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dataHoraDos(instante: Date): { data: number; hora: number } {
  return {
    data: ((instante.getUTCFullYear() - 1980) << 9) | ((instante.getUTCMonth() + 1) << 5) | instante.getUTCDate(),
    hora: (instante.getUTCHours() << 11) | (instante.getUTCMinutes() << 5) | (instante.getUTCSeconds() >> 1),
  };
}

// Empacota arquivos em um ZIP (deflate), formato exigido pelos arquivos .xlsx
export function criarZip(arquivos: ArquivoZip[], instante: Date = new Date()): Buffer {
  const { data, hora } = dataHoraDos(instante);
  const partesLocais: Buffer[] = [];
  const diretorio: Buffer[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, 'utf8');
    const comprimido = deflateRawSync(arquivo.conteudo);
    const crc = crc32(arquivo.conteudo);

    const cabecalho = Buffer.alloc(30);
    cabecalho.writeUInt32LE(0x04034b50, 0);
    cabecalho.writeUInt16LE(20, 4); // versão necessária
    cabecalho.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    cabecalho.writeUInt16LE(8, 8); // deflate
    cabecalho.writeUInt16LE(hora, 10);
    cabecalho.writeUInt16LE(data, 12);
    cabecalho.writeUInt32LE(crc, 14);
    cabecalho.writeUInt32LE(comprimido.length, 18);
    cabecalho.writeUInt32LE(arquivo.conteudo.length, 22);
    cabecalho.writeUInt16LE(nome.length, 26);
    cabecalho.writeUInt16LE(0, 28);

    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(20, 4); // versão de criação
    entrada.writeUInt16LE(20, 6); // versão necessária
    entrada.writeUInt16LE(0x0800, 8);
    entrada.writeUInt16LE(8, 10);
    entrada.writeUInt16LE(hora, 12);
    entrada.writeUInt16LE(data, 14);
    entrada.writeUInt32LE(crc, 16);
    entrada.writeUInt32LE(comprimido.length, 20);
    entrada.writeUInt32LE(arquivo.conteudo.length, 24);
    entrada.writeUInt16LE(nome.length, 28);
    entrada.writeUInt32LE(deslocamento, 42);

    partesLocais.push(cabecalho, nome, comprimido);
    diretorio.push(entrada, nome);
    deslocamento += cabecalho.length + nome.length + comprimido.length;
  }

  const tamanhoDiretorio = diretorio.reduce((total, parte) => total + parte.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamanhoDiretorio, 12);
  fim.writeUInt32LE(deslocamento, 16);

  return Buffer.concat([...partesLocais, ...diretorio, fim]);
}
