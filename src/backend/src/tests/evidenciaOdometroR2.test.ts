import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carregarEnv } from '../config/env';
import { armazenamentoR2 } from '../services/armazenamentoEvidenciasR2';
import { chaveR2Evidencia } from '../services/chavesEvidencias';
import { normalizarFotoOdometro } from '../services/imagemEvidencias';

const variaveisR2Teste = {
  JWT_SECRET: 'ci-test-only-secret-not-for-production',
  NODE_ENV: 'test',
  EVIDENCIAS_STORAGE: 'r2',
  EVIDENCIAS_R2_AMBIENTE: 'teste',
  EVIDENCIAS_R2_BUCKET: 'evidencias-teste',
  EVIDENCIAS_R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  EVIDENCIAS_R2_ACCESS_KEY_ID: 'chave-sintetica',
  EVIDENCIAS_R2_SECRET_ACCESS_KEY: 'segredo-sintetico',
  EVIDENCIAS_R2_CHAVE_SECRETA: '0123456789abcdef'.repeat(4),
};

describe('Configuração e chaves R2', () => {
  it('valida bucket, conta, jurisdição e credenciais sem exibir os valores', () => {
    const env = carregarEnv({ ...variaveisR2Teste, EVIDENCIAS_R2_JURISDICAO: 'eu' });
    expect(env.evidenciasR2?.endpoint).toBe('https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com');
    for (const [nome, valor] of [
      ['EVIDENCIAS_R2_AMBIENTE', 'producao'],
      ['EVIDENCIAS_R2_BUCKET', 'bucket-producao'],
      ['EVIDENCIAS_R2_ACCOUNT_ID', 'malicioso.invalid/path'],
      ['EVIDENCIAS_R2_JURISDICAO', 'http://externo.invalid'],
      ['EVIDENCIAS_R2_ACCESS_KEY_ID', ''],
      ['EVIDENCIAS_R2_CHAVE_SECRETA', 'segredo-invalido'],
      ['EVIDENCIAS_R2_TIMEOUT_MS', '9000'],
    ] as const) {
      expect(() => carregarEnv({ ...variaveisR2Teste, [nome]: valor })).toThrow(nome);
    }
  });

  it('gera chaves opacas e distintas por autor ou segredo do ambiente', () => {
    const uuid = randomUUID();
    const segredo = variaveisR2Teste.EVIDENCIAS_R2_CHAVE_SECRETA;
    const chave = chaveR2Evidencia(42, uuid, segredo);
    expect(chave).toMatch(/^odometro\/v1\/[0-9a-f]{64}$/);
    expect(chave).toBe(chaveR2Evidencia(42, uuid, segredo));
    expect(chave).not.toBe(chaveR2Evidencia(43, uuid, segredo));
    expect(chave).not.toBe(chaveR2Evidencia(42, uuid, 'fedcba9876543210'.repeat(4)));
  });
});

describe('Contrato S3 do adaptador R2 com servidor HTTP isolado', () => {
  const config = carregarEnv(variaveisR2Teste).evidenciasR2!;
  const chave = chaveR2Evidencia(1, randomUUID(), config.segredoIdempotencia);
  const chaveS3 = `/${config.bucket}/${chave}`;
  const objetos = new Map<string, Buffer>();
  let servidor: Server;
  let cliente: S3Client;
  let modo: 'normal' | 'negado' | 'lento';
  const solicitacoes: { condicional?: string; assinatura?: string; caminho?: string }[] = [];

  beforeEach(async () => {
    objetos.clear();
    solicitacoes.length = 0;
    modo = 'normal';
    servidor = createServer(async (req, res) => {
      const caminho = req.url?.split('?')[0] ?? '';
      const erro = (status: number, codigo: string): void => {
        res.writeHead(status, { 'Content-Type': 'application/xml' }).end(`<Error><Code>${codigo}</Code></Error>`);
      };
      if (modo === 'lento') return;
      if (modo === 'negado' || !req.headers.authorization) return erro(403, 'AccessDenied');
      if (req.method === 'PUT') {
        solicitacoes.push({ condicional: req.headers['if-none-match'], assinatura: req.headers.authorization, caminho });
        const partes: Buffer[] = [];
        for await (const parte of req) partes.push(Buffer.from(parte));
        if (objetos.has(caminho) && req.headers['if-none-match'] === '*') return erro(412, 'PreconditionFailed');
        objetos.set(caminho, Buffer.concat(partes));
        res.writeHead(200).end();
      } else if (req.method === 'GET') {
        const objeto = objetos.get(caminho);
        if (!objeto) return erro(404, 'NoSuchKey');
        // Sem Content-Length, para exercitar a proteção durante leitura em chunks.
        res.writeHead(200).write(objeto);
        res.end();
      } else if (req.method === 'DELETE') {
        objetos.delete(caminho);
        res.writeHead(204).end();
      }
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    cliente = new S3Client({
      endpoint: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, forcePathStyle: true, region: 'auto',
      credentials: config.credenciais, requestChecksumCalculation: 'WHEN_REQUIRED', maxAttempts: 1,
    });
  });

  afterEach(async () => {
    cliente.destroy();
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  it('assina a escrita condicional, recupera após reinstanciar e descarta idempotentemente', async () => {
    const bytes = Buffer.from('imagem-sintetica');
    const storage = armazenamentoR2(config, cliente);
    await storage.salvar(chave, bytes, 'image/png');
    await storage.salvar(chave, bytes, 'image/png');
    await expect(storage.salvar(chave, Buffer.from('outros-bytes'), 'image/png')).rejects.toMatchObject({ statusCode: 409 });
    expect(solicitacoes[0]).toMatchObject({ condicional: '*', caminho: chaveS3, assinatura: expect.stringMatching(/^AWS4-HMAC-SHA256 /) });
    const reiniciado = armazenamentoR2(config, cliente);
    await expect(reiniciado.ler(chave)).resolves.toEqual(bytes);
    await expect(reiniciado.ler(chave, bytes.length - 1)).rejects.toMatchObject({ statusCode: 502 });
    await reiniciado.remover(chave);
    await reiniciado.remover(chave);
    await expect(reiniciado.ler(chave)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recusa traversal e diferencia permissão negada ou timeout de objeto ausente', async () => {
    const storage = armazenamentoR2({ ...config, timeoutMs: 250 }, cliente);
    await expect(storage.ler('../outra-chave')).rejects.toMatchObject({ statusCode: 500 });
    modo = 'negado';
    await expect(storage.ler(chave)).rejects.toMatchObject({ statusCode: 503 });
    modo = 'lento';
    await expect(storage.ler(chave)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('Validação real dos bytes de imagem', () => {
  it('decodifica a imagem, aplica orientação e remove EXIF', async () => {
    const original = await sharp({ create: { width: 32, height: 16, channels: 3, background: 'red' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const normalizada = await normalizarFotoOdometro(original);
    expect(normalizada.formato).toBe('image/jpeg');
    const meta = await sharp(normalizada.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([16, 32]);
    expect(meta.exif).toBeUndefined();
    await expect(normalizarFotoOdometro(original.subarray(0, original.length - 20)))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
