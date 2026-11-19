import { describe, expect, it } from 'vitest';
import { detectarFormato, TAMANHO_MAXIMO_FOTO_MB, validarFotoOdometro, viagemDoRegistro } from './fotoOdometro';

const bytes = (...valores: number[]) => new Uint8Array(valores);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const WEBP = [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')];
const HEIC = [0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii('heic')];

const arquivo = (conteudo: number[], nome = 'odometro.jpg', tipo = 'image/jpeg') =>
  new File([new Uint8Array(conteudo)], nome, { type: tipo });

describe('foto do odômetro: validação preventiva (SCRUM-214)', () => {
  it('reconhece o formato pelo conteúdo, não pelo nome', () => {
    expect(detectarFormato(bytes(...JPEG))).toBe('image/jpeg');
    expect(detectarFormato(bytes(...PNG))).toBe('image/png');
    expect(detectarFormato(bytes(...WEBP))).toBe('image/webp');
    expect(detectarFormato(bytes(...HEIC))).toBe('heic');
    expect(detectarFormato(bytes(...ascii('%PDF-1.7 abcd')))).toBeNull();
  });

  it('aceita JPG, PNG e WebP válidos', async () => {
    expect(await validarFotoOdometro(arquivo(JPEG))).toBeNull();
    expect(await validarFotoOdometro(arquivo(PNG, 'a.png', 'image/png'))).toBeNull();
    expect(await validarFotoOdometro(arquivo(WEBP, 'a.webp', 'image/webp'))).toBeNull();
  });

  it('recusa arquivo vazio, mascarado e HEIC com orientação clara', async () => {
    expect(await validarFotoOdometro(arquivo([]))).toMatch(/vazio/);
    // PDF renomeado para .jpg
    expect(await validarFotoOdometro(arquivo(ascii('%PDF-1.7 abcd')))).toMatch(/não é uma imagem válida/);
    expect(await validarFotoOdometro(arquivo(HEIC, 'IMG_1.heic', 'image/heic'))).toMatch(/HEIC não são aceitas/);
  });

  it('recusa foto acima do limite sem ler o conteúdo', async () => {
    const grande = arquivo(JPEG);
    Object.defineProperty(grande, 'size', { value: TAMANHO_MAXIMO_FOTO_MB * 1024 * 1024 + 1 });
    expect(await validarFotoOdometro(grande)).toMatch(`mais de ${TAMANHO_MAXIMO_FOTO_MB} MB`);
  });
});

describe('viagemDoRegistro: origem das fotos na Auditoria (SCRUM-207)', () => {
  it('identifica saída e chegada com o tipo da operação', () => {
    expect(viagemDoRegistro('INICIOU_VIAGEM tipo=SVO id=12 km_inicial=100')).toEqual({ tipo_operacao: 'SVO', id: 12 });
    expect(viagemDoRegistro('FINALIZOU_VIAGEM tipo=ADMINISTRATIVA id=12 km_final=150')).toEqual({
      tipo_operacao: 'ADMINISTRATIVA',
      id: 12,
    });
  });

  it('ignora outros registros e ids parciais', () => {
    expect(viagemDoRegistro('CANCELOU_VIAGEM tipo=SVO id=12')).toBeNull();
    expect(viagemDoRegistro('LOGIN_SUCESSO')).toBeNull();
    expect(viagemDoRegistro('INICIOU_VIAGEM tipo=SVO id=12abc')).toBeNull();
  });
});
