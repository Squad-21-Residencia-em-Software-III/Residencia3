
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { motoristaService } from '../services/motoristaService';
import { PERFIS, type Perfil } from '../constants/perfis';
import { configMotoristas } from '../config/motoristas';
import { AppError } from '../errors/AppError';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/motoristaService', () => ({
  motoristaService: {
    listar: vi.fn().mockResolvedValue([
      {
        id: 1,
        usuario_id: 5,
        nome: 'Max Verstappen',
        cnh_final: '3333',
        categoria_cnh: 'B',
        validade_cnh: '2030-12-31',
        tipo_motorista: 'FROTA',
        status: 'DISPONIVEL',
      },
    ]),
    buscarPorUsuarioId: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    buscarDetalhe: vi.fn(),
    listarUsuariosElegiveis: vi.fn(),
  },
}));

const autenticarComo = (perfil: Perfil, id = 3) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('GET /api/motoristas', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_FROTA);
  });

  it('deve listar motoristas com nome e status, sem o número integral da CNH', async () => {
    const resposta = await request(app).get('/api/motoristas').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body[0]).toMatchObject({ nome: 'Max Verstappen', status: 'DISPONIVEL', cnh_final: '3333' });
    expect(resposta.body[0]).not.toHaveProperty('numero_cnh');
    expect(motoristaService.listar).toHaveBeenCalledWith({});
  });

  it('deve repassar os filtros de status e tipo', async () => {
    await request(app)
      .get('/api/motoristas?status=DISPONIVEL&tipo_motorista=FROTA')
      .set('Authorization', token);

    expect(motoristaService.listar).toHaveBeenCalledWith({ status: 'DISPONIVEL', tipo_motorista: 'FROTA' });
  });

  it('deve retornar 400 para status inválido', async () => {
    const resposta = await request(app).get('/api/motoristas?status=FERIAS').set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(motoristaService.listar).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para motorista', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA);

    const resposta = await request(app).get('/api/motoristas').set('Authorization', token);

    expect(resposta.status).toBe(403);
  });
});

describe('GET /api/motoristas/me', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar os dados do motorista autenticado', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA, 5);
    vi.mocked(motoristaService.buscarPorUsuarioId).mockResolvedValueOnce({
      id: 2,
      usuario_id: 5,
      nome: 'Lewis Hamilton',
      numero_cnh: '44444444444',
      categoria_cnh: 'D',
      validade_cnh: '2029-05-15',
      tipo_motorista: 'FROTA',
      status: 'DISPONIVEL',
    });

    const resposta = await request(app).get('/api/motoristas/me').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ id: 2, nome: 'Lewis Hamilton' });
    expect(motoristaService.buscarPorUsuarioId).toHaveBeenCalledWith(5);
  });

  it('deve retornar 404 se o usuário autenticado não for um motorista cadastrado', async () => {
    autenticarComo(PERFIS.SOLICITANTE, 99);
    vi.mocked(motoristaService.buscarPorUsuarioId).mockResolvedValueOnce(undefined);

    const resposta = await request(app).get('/api/motoristas/me').set('Authorization', token);

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro).toContain('Registro de motorista não encontrado');
  });
});

const detalhe = {
  id: 9,
  usuario_id: 5,
  nome: 'Motorista Sintético',
  numero_cnh: '01234567890',
  categoria_cnh: 'B',
  validade_cnh: '2030-12-31',
  tipo_motorista: 'FROTA',
  status: 'DISPONIVEL',
  cnh_vencida: false,
};

const corpoValido = { usuario_id: 5, numero_cnh: '01234567890', categoria_cnh: 'B', validade_cnh: '2030-12-31' };

describe('SCRUM-308: escrita de motoristas', () => {
  const token = 'Bearer token-teste';
  const criar = (corpo: unknown) => request(app).post('/api/motoristas').set('Authorization', token).send(corpo as object);
  const editar = (corpo: unknown, id: string | number = 9) =>
    request(app).patch(`/api/motoristas/${id}`).set('Authorization', token).send(corpo as object);
  const campos = (body: { detalhes?: { campo: string }[] }) => (body.detalhes ?? []).map((d) => d.campo);

  beforeEach(() => {
    vi.clearAllMocks();
    configMotoristas.escritaAtiva = true;
    autenticarComo(PERFIS.ADMINISTRADOR, 1);
    vi.mocked(motoristaService.criar).mockResolvedValue(detalhe as never);
    vi.mocked(motoristaService.atualizar).mockResolvedValue(detalhe as never);
    vi.mocked(motoristaService.buscarDetalhe).mockResolvedValue(detalhe as never);
  });

  it('cria com 201, Location e preserva os zeros à esquerda', async () => {
    const res = await criar(corpoValido);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/api/motoristas/9');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(motoristaService.criar).toHaveBeenCalledWith(
      { usuario_id: 5, numero_cnh: '01234567890', categoria_cnh: 'B', validade_cnh: '2030-12-31' },
      expect.objectContaining({ id: 1, perfil: PERFIS.ADMINISTRADOR })
    );
  });

  it.each([
    ['012.345.678-90', '01234567890'],
    [' 0123 4567 890 ', '01234567890'],
    ['00012345678', '00012345678'],
  ])('normaliza os separadores aceitos: %s', async (entrada, esperado) => {
    const res = await criar({ ...corpoValido, numero_cnh: entrada });

    expect(res.status).toBe(201);
    expect(vi.mocked(motoristaService.criar).mock.calls[0][0].numero_cnh).toBe(esperado);
  });

  it.each([
    ['10 dígitos', '0123456789'],
    ['12 dígitos', '012345678901'],
    ['letras', '0123456789A'],
    ['outro separador', '0123456789/0'],
    ['todos zeros', '00000000000'],
    ['todos iguais', '11111111111'],
    ['vazio', ''],
    ['número JSON', 12345678901],
  ])('rejeita número manifestamente inválido (%s)', async (_caso, numero) => {
    const res = await criar({ ...corpoValido, numero_cnh: numero });

    expect(res.status).toBe(400);
    expect(campos(res.body)).toEqual(['numero_cnh']);
    expect(motoristaService.criar).not.toHaveBeenCalled();
  });

  it.each(['F', 'BA', 'ACC', '', 'ABCDE', 'b c'])('rejeita categoria fora da lista aprovada: "%s"', async (categoria) => {
    const res = await criar({ ...corpoValido, categoria_cnh: categoria });

    expect(res.status).toBe(400);
    expect(campos(res.body)).toEqual(['categoria_cnh']);
  });

  it('normaliza a categoria para maiúsculas', async () => {
    await criar({ ...corpoValido, categoria_cnh: ' ae ' });

    expect(vi.mocked(motoristaService.criar).mock.calls[0][0].categoria_cnh).toBe('AE');
  });

  it.each([
    ['dia inexistente', '2027-02-30'],
    ['mês 13', '2027-13-01'],
    ['29/02 fora de ano bissexto', '2027-02-29'],
    ['2100 não é bissexto', '2100-02-29'],
    ['formato brasileiro', '31/12/2030'],
    ['timestamp', '2030-12-31T00:00:00Z'],
    ['antes do limite', '1999-12-31'],
    ['depois do limite', '2100-01-01'],
    ['dia zero', '2030-01-00'],
  ])('rejeita validade inválida (%s)', async (_caso, validade) => {
    const res = await criar({ ...corpoValido, validade_cnh: validade });

    expect(res.status).toBe(400);
    expect(campos(res.body)).toContain('validade_cnh');
    expect(new Set(campos(res.body))).toEqual(new Set(['validade_cnh']));
  });

  it.each(['2028-02-29', '2000-02-29', '2000-01-01', '2099-12-31'])('aceita a data civil válida %s', async (validade) => {
    const res = await criar({ ...corpoValido, validade_cnh: validade });

    expect(res.status).toBe(201);
    expect(vi.mocked(motoristaService.criar).mock.calls[0][0].validade_cnh).toBe(validade);
  });

  it('aceita CNH vencida e sinaliza a condição sem tratá-la como erro', async () => {
    vi.mocked(motoristaService.criar).mockResolvedValueOnce({ ...detalhe, validade_cnh: '2020-01-01', cnh_vencida: true } as never);

    const res = await criar({ ...corpoValido, validade_cnh: '2020-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.cnh_vencida).toBe(true);
  });

  it.each([
    ['tipo_motorista', { tipo_motorista: 'SVO' }],
    ['status', { status: 'INATIVO' }],
    ['perfil', { perfil: 'ADMINISTRADOR' }],
    ['unidade_id', { unidade_id: 2 }],
    ['id', { id: 99 }],
  ])('rejeita campo indevido no corpo (%s)', async (campo, extra) => {
    const res = await criar({ ...corpoValido, ...extra });

    expect(res.status).toBe(400);
    expect(campos(res.body)).toContain(campo);
    expect(motoristaService.criar).not.toHaveBeenCalled();
  });

  it('rejeita cadastro sem usuário', async () => {
    const { usuario_id: _omitido, ...semUsuario } = corpoValido;
    const res = await criar(semUsuario);

    expect(res.status).toBe(400);
    expect(campos(res.body)).toEqual(['usuario_id']);
  });

  it('devolve 409 de CNH duplicada sem dados do outro registro', async () => {
    vi.mocked(motoristaService.criar).mockRejectedValueOnce(
      new AppError('Já existe um motorista cadastrado com esta CNH', 409, 'CNH_DUPLICADA')
    );

    const res = await criar(corpoValido);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ erro: 'Já existe um motorista cadastrado com esta CNH', codigo: 'CNH_DUPLICADA' });
  });

  it('logs de requisição e de falha não carregam o número da CNH', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(motoristaService.criar).mockRejectedValueOnce(new Error('falha com 01234567890'));

    await criar(corpoValido);
    await criar({ ...corpoValido, numero_cnh: '9876543210' });

    expect(JSON.stringify([info.mock.calls, erros.mock.calls])).not.toMatch(/01234567890|9876543210/);
    info.mockRestore();
    erros.mockRestore();
  });

  it('edição envia ao serviço só os campos informados', async () => {
    const res = await editar({ validade_cnh: '2031-01-15' });

    expect(res.status).toBe(200);
    expect(motoristaService.atualizar).toHaveBeenCalledWith(9, { validade_cnh: '2031-01-15' }, expect.anything());
  });

  it('edição normaliza o número informado', async () => {
    await editar({ numero_cnh: '000.111.222-33' });

    expect(motoristaService.atualizar).toHaveBeenCalledWith(9, { numero_cnh: '00011122233' }, expect.anything());
  });

  it.each([
    ['corpo vazio', {}],
    ['usuario_id', { usuario_id: 3 }],
    ['tipo_motorista', { tipo_motorista: 'SVO' }],
    ['status', { status: 'AFASTADO', validade_cnh: '2031-01-15' }],
  ])('edição rejeita %s', async (_caso, corpo) => {
    const res = await editar(corpo);

    expect(res.status).toBe(400);
    expect(motoristaService.atualizar).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648'])('rejeita id inválido %s', async (id) => {
    const res = await editar({ validade_cnh: '2031-01-15' }, id);

    expect(res.status).toBe(400);
    expect(motoristaService.atualizar).not.toHaveBeenCalled();
  });

  it('detalhe devolve o número integral sem cache', async () => {
    const res = await request(app).get('/api/motoristas/9').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.numero_cnh).toBe('01234567890');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(motoristaService.buscarDetalhe).toHaveBeenCalledWith(9, expect.objectContaining({ id: 1 }));
  });

  it('lista usuários elegíveis', async () => {
    vi.mocked(motoristaService.listarUsuariosElegiveis).mockResolvedValueOnce([{ id: 5, nome: 'X', perfil: 'MOTORISTA_FROTA' }]);

    const res = await request(app).get('/api/motoristas/usuarios-elegiveis').set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 5, nome: 'X', perfil: 'MOTORISTA_FROTA' }]);
  });

  describe('com a escrita desligada', () => {
    beforeEach(() => {
      configMotoristas.escritaAtiva = false;
    });

    it.each([
      ['post', '/api/motoristas'],
      ['patch', '/api/motoristas/9'],
      ['get', '/api/motoristas/9'],
      ['get', '/api/motoristas/usuarios-elegiveis'],
    ] as const)('%s %s responde 404', async (metodo, rota) => {
      const res = await request(app)[metodo](rota).set('Authorization', token).send(corpoValido);

      expect(res.status).toBe(404);
      expect(motoristaService.criar).not.toHaveBeenCalled();
      expect(motoristaService.atualizar).not.toHaveBeenCalled();
      expect(motoristaService.buscarDetalhe).not.toHaveBeenCalled();
    });

    it('a lista continua disponível', async () => {
      const res = await request(app).get('/api/motoristas').set('Authorization', token);

      expect(res.status).toBe(200);
    });
  });

  it.each([PERFIS.SOLICITANTE, PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO, PERFIS.INTEGRANTE_SVO])(
    '%s recebe 403 ao cadastrar',
    async (perfil) => {
      autenticarComo(perfil, 5);

      const res = await criar(corpoValido);

      expect(res.status).toBe(403);
      expect(motoristaService.criar).not.toHaveBeenCalled();
    }
  );
});
