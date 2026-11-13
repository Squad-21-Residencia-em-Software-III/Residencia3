import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const backupModule = require('../../scripts/backup-db.cjs') as {
  calcularHashTabela: (linhas: Array<Record<string, unknown>>) => string;
  ordenarTabelasTopologicamente: (
    tabelas: string[],
    relacoesFk: Array<{ tabela: string; referencia: string }>
  ) => string[];
  criptografarPayloadBackup: (
    payload: Record<string, unknown>,
    chaveSecreta: string
  ) => {
    buffer: Buffer;
    sha256Payload: string;
    sha256Arquivo: string;
    tamanhoBytesOriginal: number;
    tamanhoBytesCriptografado: number;
  };
  descriptografarPayloadBackup: (
    bufferCriptografado: Buffer,
    chaveSecreta: string
  ) => {
    payload: Record<string, unknown>;
    sha256Payload: string;
    sha256Arquivo: string;
  };
  aplicarPoliticaRetencao: (
    diretorioBackup: string,
    diasRetencao: number,
    agora?: Date
  ) => { removidos: string[]; mantidos: string[] };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const restoreModule = require('../../scripts/restaurar-backup-db.cjs') as {
  validarIntegridadeTabelas: (
    resumoEsperado: Record<string, { totalRegistros: number; sha256: string }>,
    tabelasRestauradas: Record<string, Array<Record<string, unknown>>>
  ) => {
    integro: boolean;
    resultados: Array<{
      tabela: string;
      totalEsperado: number;
      totalRestaurado: number;
      sha256Esperado: string;
      sha256Restaurado: string;
      integro: boolean;
    }>;
    divergencias: string[];
  };
};

describe('Rotina de backup criptografado e validacao de restauracao do PostgreSQL', () => {
  const diretoriosTemp: string[] = [];

  afterEach(() => {
    for (const dir of diretoriosTemp.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('criptografa e descriptografa o payload de backup com AES-256-GCM preservando integridade SHA-256', () => {
    const chaveSecreta = 'chave-secreta-de-teste-com-mais-de-16-caracteres-2026';
    const payloadOriginal = {
      formato: 'SVOBKP01',
      banco: { nome: 'neondb', tlsAtivo: true },
      tabelas: {
        usuarios: [
          { id: 1, email: 'admin@svo.gov.br', versao_sessao: 1 },
          { id: 2, email: 'operador@svo.gov.br', versao_sessao: 2 },
        ],
      },
    };

    const criptografado = backupModule.criptografarPayloadBackup(payloadOriginal, chaveSecreta);
    expect(criptografado.buffer.subarray(0, 8).toString('ascii')).toBe('SVOBKP01');
    expect(criptografado.tamanhoBytesCriptografado).toBeGreaterThan(40);

    const descriptografado = backupModule.descriptografarPayloadBackup(
      criptografado.buffer,
      chaveSecreta
    );

    expect(descriptografado.sha256Payload).toBe(criptografado.sha256Payload);
    expect(descriptografado.sha256Arquivo).toBe(criptografado.sha256Arquivo);
    expect(descriptografado.payload).toEqual(payloadOriginal);
  });

  it('rejeita descriptografia quando a chave for incorreta ou o arquivo tiver sido adulterado', () => {
    const chaveCorreta = 'chave-correta-muito-forte-para-backup-aes-256-gcm';
    const chaveIncorreta = 'chave-incorreta-tentativa-nao-autorizada-123456';
    const payload = { formato: 'SVOBKP01', tabelas: { usuarios: [{ id: 1 }] } };

    const { buffer } = backupModule.criptografarPayloadBackup(payload, chaveCorreta);

    expect(() => backupModule.descriptografarPayloadBackup(buffer, chaveIncorreta)).toThrow(
      /integridade criptografica/i
    );

    const bufferAdulterado = Buffer.from(buffer);
    bufferAdulterado[bufferAdulterado.length - 1] ^= 0xff;

    expect(() => backupModule.descriptografarPayloadBackup(bufferAdulterado, chaveCorreta)).toThrow(
      /integridade criptografica/i
    );
  });

  it('ordena tabelas topologicamente garantindo que tabelas pai precedam tabelas dependentes', () => {
    const tabelas = ['chamados', 'usuarios', 'equipes', 'viaturas'];
    const relacoesFk = [
      { tabela: 'chamados', referencia: 'usuarios' },
      { tabela: 'chamados', referencia: 'equipes' },
      { tabela: 'equipes', referencia: 'viaturas' },
    ];

    const ordem = backupModule.ordenarTabelasTopologicamente(tabelas, relacoesFk);

    expect(ordem.indexOf('viaturas')).toBeLessThan(ordem.indexOf('equipes'));
    expect(ordem.indexOf('equipes')).toBeLessThan(ordem.indexOf('chamados'));
    expect(ordem.indexOf('usuarios')).toBeLessThan(ordem.indexOf('chamados'));
  });

  it('valida integridade pos-restauracao e detecta divergencia de contagem ou adulteracao de registro', () => {
    const linhasOriginais = [
      { id: 1, nome: 'Viatura 01', placa: 'AAA1A11' },
      { id: 2, nome: 'Viatura 02', placa: 'BBB2B22' },
    ];
    const hashOriginal = backupModule.calcularHashTabela(linhasOriginais);
    const resumoEsperado = {
      viaturas: {
        totalRegistros: 2,
        sha256: hashOriginal,
      },
    };

    const validacaoOk = restoreModule.validarIntegridadeTabelas(resumoEsperado, {
      viaturas: [
        { placa: 'BBB2B22', id: 2, nome: 'Viatura 02' },
        { id: 1, nome: 'Viatura 01', placa: 'AAA1A11' },
      ],
    });
    expect(validacaoOk.integro).toBe(true);
    expect(validacaoOk.divergencias).toHaveLength(0);

    const validacaoCorrompida = restoreModule.validarIntegridadeTabelas(resumoEsperado, {
      viaturas: [
        { id: 1, nome: 'Viatura 01', placa: 'AAA1A11' },
        { id: 2, nome: 'Viatura 02 ALTERADA', placa: 'BBB2B22' },
      ],
    });
    expect(validacaoCorrompida.integro).toBe(false);
    expect(validacaoCorrompida.divergencias[0]).toContain('viaturas');
  });

  it('aplica a politica de retencao removendo backups expirados e preservando o mais recente', () => {
    const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'svo-backup-test-'));
    diretoriosTemp.push(dirTemp);

    const agora = new Date('2026-11-13T12:00:00.000Z');
    const doisDiasAtras = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000);
    const dezDiasAtras = new Date(agora.getTime() - 10 * 24 * 60 * 60 * 1000);

    const arqRecente = path.join(dirTemp, 'backup-recente.backup.enc');
    const metaRecente = path.join(dirTemp, 'backup-recente.backup.meta.json');
    const arqAntigo = path.join(dirTemp, 'backup-antigo.backup.enc');
    const metaAntigo = path.join(dirTemp, 'backup-antigo.backup.meta.json');

    fs.writeFileSync(arqRecente, 'enc-recente');
    fs.writeFileSync(metaRecente, '{}');
    fs.utimesSync(arqRecente, doisDiasAtras, doisDiasAtras);

    fs.writeFileSync(arqAntigo, 'enc-antigo');
    fs.writeFileSync(metaAntigo, '{}');
    fs.utimesSync(arqAntigo, dezDiasAtras, dezDiasAtras);

    const resultado = backupModule.aplicarPoliticaRetencao(dirTemp, 7, agora);

    expect(resultado.mantidos).toEqual(['backup-recente.backup.enc']);
    expect(resultado.removidos).toEqual(['backup-antigo.backup.enc']);
    expect(fs.existsSync(arqRecente)).toBe(true);
    expect(fs.existsSync(arqAntigo)).toBe(false);
    expect(fs.existsSync(metaAntigo)).toBe(false);
  });
});
