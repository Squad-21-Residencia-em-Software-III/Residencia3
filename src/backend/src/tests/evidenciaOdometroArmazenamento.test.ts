import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carregarEnv } from '../config/env';
import { armazenamentoLocal, validarChave } from '../services/armazenamentoEvidencias';
import { detectarFormato, LIMITE_FOTO_ARMAZENADA, normalizarFotoOdometro } from '../services/imagemEvidencias';

const CHAVE = 'odometro/7/3f6c0d8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const BASE_ENV = { JWT_SECRET: 'ci-test-only-secret-not-for-production' };

describe('Armazenamento local das fotos do odômetro', () => {
  let pasta: string;

  beforeEach(async () => {
    pasta = await mkdtemp(path.join(tmpdir(), 'evidencias-'));
  });

  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it('mantém a exceção desligada por padrão e coordena as flags de produção', () => {
    const producao = { ...BASE_ENV, NODE_ENV: 'production', TRUST_PROXY: '1', EVIDENCIAS_STORAGE: 'postgres' };
    expect(carregarEnv(producao).excecoesOdometroAtivas).toBe(false);
    expect(() => carregarEnv({ ...BASE_ENV, EXCECOES_ODOMETRO_ATIVAS: 'true' })).toThrow('exige EVIDENCIAS_STORAGE');
    expect(() => carregarEnv({ ...producao, FOTOS_ODOMETRO_OBRIGATORIAS: 'true' })).toThrow('EXCECOES_ODOMETRO_ATIVAS');
    expect(carregarEnv({
      ...producao, EXCECOES_ODOMETRO_ATIVAS: 'true', FOTOS_ODOMETRO_OBRIGATORIAS: 'true',
    })).toMatchObject({ excecoesOdometroAtivas: true, fotosOdometroObrigatorias: true, evidenciasStorage: 'postgres' });
  });

  it('salva, lê e remove pela chave, sem deixar temporários', async () => {
    const armazenamento = armazenamentoLocal(pasta);
    await armazenamento.salvar(CHAVE, Buffer.from([0xff, 0xd8, 0xff, 1, 2]));
    expect(await armazenamento.ler(CHAVE)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 1, 2]));
    expect(await readdir(path.join(pasta, 'odometro', '7'))).toEqual([CHAVE.split('/')[2]]);

    await armazenamento.remover(CHAVE);
    await expect(armazenamento.ler(CHAVE)).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    '../fora/3f6c0d8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    'odometro/7/../../segredo',
    '/etc/passwd',
    'https://exemplo.com/foto.jpg',
    'data:image/png;base64,AAAA',
    'odometro/x/3f6c0d8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  ])('recusa chave fora do formato: %s', async (chave) => {
    expect(() => validarChave(chave)).toThrow('Chave de armazenamento inválida');
    await expect(armazenamentoLocal(pasta).salvar(chave, Buffer.from('x'))).rejects.toThrow();
  });
});

describe('Formato da foto pelo conteúdo', () => {
  it('comprime a foto, aplica a orientação e descarta EXIF', async () => {
    const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'red' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const normalizada = await normalizarFotoOdometro(original);
    const meta = await sharp(normalizada.bytes).metadata();
    expect(normalizada.formato).toBe('image/jpeg');
    expect(normalizada.bytes.length).toBeLessThanOrEqual(LIMITE_FOTO_ARMAZENADA);
    expect([meta.width, meta.height]).toEqual([800, 1600]);
    expect(meta.exif).toBeUndefined();
    await expect(normalizarFotoOdometro(original.subarray(0, original.length - 50))).rejects.toMatchObject({ statusCode: 422 });
  });

  it('reconhece JPEG, PNG e WebP pela assinatura', () => {
    expect(detectarFormato(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectarFormato(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(detectarFormato(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
  });

  it('recusa PDF renomeado, HEIC, texto e arquivo vazio', () => {
    expect(detectarFormato(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectarFormato(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')]))).toBeNull();
    expect(detectarFormato(Buffer.from('<svg></svg>'))).toBeNull();
    expect(detectarFormato(Buffer.alloc(0))).toBeNull();
  });
});

describe('Configuração das fotos do odômetro', () => {
  it('permite PostgreSQL só com as variáveis existentes do banco e valida o teto', () => {
    const postgres = { ...BASE_ENV, EVIDENCIAS_STORAGE: 'postgres' };
    expect(carregarEnv(postgres).evidenciasPostgresLimiteBytes).toBe(128 * 1024 * 1024);
    expect(carregarEnv({ ...postgres, EVIDENCIAS_POSTGRES_LIMITE_MIB: '40' }).evidenciasPostgresLimiteBytes).toBe(40 * 1024 * 1024);
    expect(() => carregarEnv({ ...postgres, EVIDENCIAS_POSTGRES_LIMITE_MIB: '513' })).toThrow('EVIDENCIAS_POSTGRES_LIMITE_MIB');
  });

  it('fica desligada por padrão: sem armazenamento e sem foto obrigatória', () => {
    const env = carregarEnv(BASE_ENV);
    expect(env.evidenciasStorage).toBe('desativado');
    expect(env.fotosOdometroObrigatorias).toBe(false);
  });

  it('aceita a pasta local fora de produção, com caminho padrão', () => {
    const env = carregarEnv({ ...BASE_ENV, EVIDENCIAS_STORAGE: 'local' });
    expect(env.evidenciasStorage).toBe('local');
    expect(path.isAbsolute(env.evidenciasStorageDir)).toBe(true);
  });

  it('recusa driver desconhecido e valor inválido de obrigatoriedade', () => {
    expect(() => carregarEnv({ ...BASE_ENV, EVIDENCIAS_STORAGE: 's3' })).toThrow('EVIDENCIAS_STORAGE');
    expect(() => carregarEnv({ ...BASE_ENV, FOTOS_ODOMETRO_OBRIGATORIAS: 'sim' })).toThrow('FOTOS_ODOMETRO_OBRIGATORIAS');
  });

  it('não deixa exigir foto sem armazenamento configurado', () => {
    expect(() => carregarEnv({ ...BASE_ENV, FOTOS_ODOMETRO_OBRIGATORIAS: 'true' })).toThrow('exige EVIDENCIAS_STORAGE');
    expect(carregarEnv({ ...BASE_ENV, EVIDENCIAS_STORAGE: 'local', FOTOS_ODOMETRO_OBRIGATORIAS: 'true' }).fotosOdometroObrigatorias).toBe(true);
  });

  it('em produção, a pasta local precisa ser declarada como caminho absoluto (disco persistente)', () => {
    const producao = { ...BASE_ENV, NODE_ENV: 'production', TRUST_PROXY: '1', EVIDENCIAS_STORAGE: 'local' };
    expect(() => carregarEnv(producao)).toThrow('disco persistente');
    expect(() => carregarEnv({ ...producao, EVIDENCIAS_STORAGE_DIR: 'relativo/fotos' })).toThrow('disco persistente');
    expect(carregarEnv({ ...producao, EVIDENCIAS_STORAGE_DIR: path.resolve('/var/data/fotos') }).evidenciasStorageDir)
      .toBe(path.resolve('/var/data/fotos'));
  });
});
