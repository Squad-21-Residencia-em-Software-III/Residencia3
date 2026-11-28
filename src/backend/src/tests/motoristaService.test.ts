import { beforeEach, describe, expect, it, vi } from 'vitest';

const trx = { id: 'trx' };
vi.mock('../config/database', () => ({ db: { transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(trx)) } }));
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { MOTORISTAS: 'MOTORISTAS' },
}));
vi.mock('../models/motoristaModel', () => ({
  motoristaModel: {
    travarUsuario: vi.fn(),
    existeParaUsuario: vi.fn(),
    travarNumeroCnh: vi.fn(),
    existeCnhCanonica: vi.fn(),
    criar: vi.fn(),
    buscarDetalhe: vi.fn(),
    buscarParaAtualizar: vi.fn(),
    atualizarCnh: vi.fn(),
    listarUsuariosElegiveis: vi.fn(),
  },
}));

import { PERFIS } from '../constants/perfis';
import { auditoriaModel } from '../models/auditoriaModel';
import { motoristaModel } from '../models/motoristaModel';
import { motoristaService, tiposGerenciaveis } from '../services/motoristaService';

const ADM = { id: 1, perfil: PERFIS.ADMINISTRADOR };
const GF = { id: 2, perfil: PERFIS.GESTOR_FROTA };
const GS = { id: 3, perfil: PERFIS.GESTOR_SVO };
const novo = { usuario_id: 5, numero_cnh: '01234567890', categoria_cnh: 'B', validade_cnh: '2030-12-31' } as const;
const detalhe = { id: 9, usuario_id: 5, nome: 'Sintético', numero_cnh: '01234567890', categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA' as const, status: 'DISPONIVEL' as const };

const erroUnique = (constraint: string) => Object.assign(new Error('duplicate key'), { code: '23505', constraint });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(motoristaModel.travarUsuario).mockResolvedValue({ id: 5, perfil: 'MOTORISTA_FROTA', ativo: true });
  vi.mocked(motoristaModel.existeParaUsuario).mockResolvedValue(false);
  vi.mocked(motoristaModel.existeCnhCanonica).mockResolvedValue(false);
  vi.mocked(motoristaModel.criar).mockResolvedValue(9);
  vi.mocked(motoristaModel.buscarDetalhe).mockResolvedValue(detalhe);
  vi.mocked(motoristaModel.buscarParaAtualizar).mockResolvedValue({ id: 9, tipo_motorista: 'FROTA' });
});

describe('tiposGerenciaveis', () => {
  it('segue a regra 6 da matriz', () => {
    expect(tiposGerenciaveis(PERFIS.ADMINISTRADOR)).toEqual(['FROTA', 'SVO']);
    expect(tiposGerenciaveis(PERFIS.GESTOR_FROTA)).toEqual(['FROTA']);
    expect(tiposGerenciaveis(PERFIS.GESTOR_SVO)).toEqual(['SVO']);
    for (const perfil of [PERFIS.SOLICITANTE, PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO, PERFIS.INTEGRANTE_SVO]) {
      expect(tiposGerenciaveis(perfil)).toEqual([]);
    }
  });
});

describe('motoristaService.criar', () => {
  it('deriva o tipo do perfil do usuário, grava e audita sem o número', async () => {
    const res = await motoristaService.criar(novo, ADM);

    expect(motoristaModel.criar).toHaveBeenCalledWith({ ...novo, tipo_motorista: 'FROTA' }, trx);
    expect(motoristaModel.travarNumeroCnh).toHaveBeenCalledWith('01234567890', trx);
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      { usuario_id: 1, acao: 'CADASTROU_MOTORISTA id=9 usuario_id=5', modulo: 'MOTORISTAS' },
      trx
    );
    expect(JSON.stringify(vi.mocked(auditoriaModel.registrar).mock.calls)).not.toContain('01234567890');
    expect(res).toMatchObject({ id: 9, cnh_vencida: false });
  });

  it('marca a CNH vencida como condição, não como erro', async () => {
    vi.mocked(motoristaModel.buscarDetalhe).mockResolvedValue({ ...detalhe, validade_cnh: '2001-01-01' });

    await expect(motoristaService.criar({ ...novo, validade_cnh: '2001-01-01' }, ADM)).resolves.toMatchObject({ cnh_vencida: true });
  });

  it.each([
    ['inexistente', undefined],
    ['inativo', { id: 5, perfil: 'MOTORISTA_FROTA', ativo: false }],
    ['sem perfil de motorista', { id: 5, perfil: 'SOLICITANTE', ativo: true }],
  ])('recusa usuário %s com 422', async (_caso, usuario) => {
    vi.mocked(motoristaModel.travarUsuario).mockResolvedValue(usuario);

    await expect(motoristaService.criar(novo, ADM)).rejects.toMatchObject({ statusCode: 422, codigo: 'USUARIO_NAO_ELEGIVEL' });
    expect(motoristaModel.criar).not.toHaveBeenCalled();
  });

  it('Gestor de Frota não cadastra motorista SVO', async () => {
    vi.mocked(motoristaModel.travarUsuario).mockResolvedValue({ id: 5, perfil: 'MOTORISTA_SVO', ativo: true });

    await expect(motoristaService.criar(novo, GF)).rejects.toMatchObject({ statusCode: 403 });
    expect(motoristaModel.criar).not.toHaveBeenCalled();
  });

  it('Gestor SVO não cadastra motorista FROTA, mas cadastra SVO', async () => {
    await expect(motoristaService.criar(novo, GS)).rejects.toMatchObject({ statusCode: 403 });

    vi.mocked(motoristaModel.travarUsuario).mockResolvedValue({ id: 5, perfil: 'MOTORISTA_SVO', ativo: true });
    await motoristaService.criar(novo, GS);
    expect(motoristaModel.criar).toHaveBeenCalledWith(expect.objectContaining({ tipo_motorista: 'SVO' }), trx);
  });

  it('pré-checagem: usuário já cadastrado vira 409', async () => {
    vi.mocked(motoristaModel.existeParaUsuario).mockResolvedValue(true);

    await expect(motoristaService.criar(novo, ADM)).rejects.toMatchObject({ statusCode: 409, codigo: 'MOTORISTA_JA_CADASTRADO' });
  });

  it('pré-checagem: CNH equivalente vira 409 sem identificar o titular', async () => {
    vi.mocked(motoristaModel.existeCnhCanonica).mockResolvedValue(true);

    const erro = await motoristaService.criar(novo, ADM).catch((e) => e);
    expect(erro).toMatchObject({ statusCode: 409, codigo: 'CNH_DUPLICADA', message: 'Já existe um motorista cadastrado com esta CNH' });
    expect(erro.contexto).toBeUndefined();
  });

  it.each([
    ['uq_motoristas_numero_cnh_canonico', 'CNH_DUPLICADA'],
    ['motoristas_numero_cnh_unique', 'CNH_DUPLICADA'],
    ['uq_motoristas_usuario_id', 'MOTORISTA_JA_CADASTRADO'],
  ])('corrida que viola %s no banco vira 409 %s', async (constraint, codigo) => {
    vi.mocked(motoristaModel.criar).mockRejectedValue(erroUnique(constraint));

    await expect(motoristaService.criar(novo, ADM)).rejects.toMatchObject({ statusCode: 409, codigo });
  });

  it('outros erros do banco não são mascarados como 409', async () => {
    vi.mocked(motoristaModel.criar).mockRejectedValue(erroUnique('outra_restricao'));

    await expect(motoristaService.criar(novo, ADM)).rejects.toMatchObject({ code: '23505' });
  });
});

describe('motoristaService.atualizar', () => {
  it('atualiza só os campos enviados e audita os nomes dos campos', async () => {
    await motoristaService.atualizar(9, { validade_cnh: '2031-01-15' }, GF);

    expect(motoristaModel.atualizarCnh).toHaveBeenCalledWith(9, { validade_cnh: '2031-01-15' }, trx);
    expect(motoristaModel.travarNumeroCnh).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      { usuario_id: 2, acao: 'ATUALIZOU_MOTORISTA id=9 campos=validade_cnh', modulo: 'MOTORISTAS' },
      trx
    );
  });

  it('troca de número verifica duplicidade ignorando o próprio registro', async () => {
    await motoristaService.atualizar(9, { numero_cnh: '00011122233' }, ADM);

    expect(motoristaModel.travarNumeroCnh).toHaveBeenCalledWith('00011122233', trx);
    expect(motoristaModel.existeCnhCanonica).toHaveBeenCalledWith('00011122233', trx, 9);
    expect(JSON.stringify(vi.mocked(auditoriaModel.registrar).mock.calls)).not.toContain('00011122233');
  });

  it('404 quando o motorista não existe', async () => {
    vi.mocked(motoristaModel.buscarParaAtualizar).mockResolvedValue(undefined);

    await expect(motoristaService.atualizar(9, { categoria_cnh: 'D' }, ADM)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('Gestor SVO não edita motorista FROTA', async () => {
    await expect(motoristaService.atualizar(9, { categoria_cnh: 'D' }, GS)).rejects.toMatchObject({ statusCode: 403 });
    expect(motoristaModel.atualizarCnh).not.toHaveBeenCalled();
  });

  it('CNH de outro motorista vira 409', async () => {
    vi.mocked(motoristaModel.existeCnhCanonica).mockResolvedValue(true);

    await expect(motoristaService.atualizar(9, { numero_cnh: '00011122233' }, ADM)).rejects.toMatchObject({ statusCode: 409 });
    expect(motoristaModel.atualizarCnh).not.toHaveBeenCalled();
  });
});

describe('motoristaService.buscarDetalhe e elegíveis', () => {
  it('aplica a competência ao detalhe', async () => {
    await expect(motoristaService.buscarDetalhe(9, GS)).rejects.toMatchObject({ statusCode: 403 });
    await expect(motoristaService.buscarDetalhe(9, GF)).resolves.toMatchObject({ numero_cnh: '01234567890' });
  });

  it('404 para detalhe inexistente', async () => {
    vi.mocked(motoristaModel.buscarDetalhe).mockResolvedValue(undefined);

    await expect(motoristaService.buscarDetalhe(9, ADM)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('elegíveis filtrados pelos tipos que o autor gerencia', async () => {
    await motoristaService.listarUsuariosElegiveis(GS);

    expect(motoristaModel.listarUsuariosElegiveis).toHaveBeenCalledWith(['SVO']);
  });
});
