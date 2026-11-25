import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../config/database', () => ({ db: vi.fn() }));
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../models/unidadeModel', () => ({ unidadeModel: { estaAssociadoPorNome: vi.fn() } }));
vi.mock('../models/notificacaoModel', () => ({
  notificacaoModel: { listar: vi.fn(), contarNaoLidas: vi.fn(), marcarLida: vi.fn(), marcarNaoLidas: vi.fn() },
}));

import { app } from '../app';
import { LISTA_PERFIS, PERFIS, type Perfil } from '../constants/perfis';
import { ACESSO_POR_PERFIL } from '../constants/referenciasNotificacao';
import { notificacaoModel } from '../models/notificacaoModel';
import { unidadeModel } from '../models/unidadeModel';
import { authService } from '../services/authService';

const modelo = vi.mocked(notificacaoModel);
const entrarComo = (perfil: Perfil) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil } as never);

type Metodo = 'get' | 'patch';
const chamar = (metodo: Metodo, caminho: string, corpo?: object) => {
  const req = request(app)[metodo](`/api/notificacoes${caminho}`).set('Authorization', 'Bearer t');
  return corpo ? req.send(corpo) : req;
};

const ROTAS: [Metodo, string, object?][] = [
  ['get', ''],
  ['get', '/contador'],
  ['patch', '/1/lida'],
  ['patch', '/ler-todas'],
  ['patch', '/referencia/lida', { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 1 }],
];

beforeEach(() => {
  vi.resetAllMocks();
  entrarComo(PERFIS.SOLICITANTE);
  vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(true);
  modelo.listar.mockResolvedValue({ itens: [] });
  modelo.contarNaoLidas.mockResolvedValue({ total: 3, soma: '120' });
  modelo.marcarLida.mockImplementation(async (_escopo, id) => ({ id, lida_em: new Date('2026-11-24T17:05:12Z') }));
  modelo.marcarNaoLidas.mockResolvedValue(2);
});

describe('Acesso', () => {
  it.each(ROTAS)('%s /notificacoes%s exige sessão', async (metodo, caminho) => {
    const res = await request(app)[metodo](`/api/notificacoes${caminho}`);
    expect(res.status).toBe(401);
  });

  it.each(LISTA_PERFIS)('%s acessa os próprios avisos', async (perfil) => {
    entrarComo(perfil);
    for (const [metodo, caminho, corpo] of ROTAS) {
      expect((await chamar(metodo, caminho, corpo)).status, caminho).toBe(200);
    }
  });

  const ADM = 'Administrativo';
  it.each([
    [PERFIS.ADMINISTRADOR, true, [ADM, 'SVO']],
    [PERFIS.SOLICITANTE, true, [ADM]],
    [PERFIS.GESTOR_FROTA, true, [ADM]],
    [PERFIS.GESTOR_SVO, true, [ADM, 'SVO']],
    [PERFIS.GESTOR_SVO, false, [ADM]],
    [PERFIS.MOTORISTA_FROTA, true, [ADM]],
    [PERFIS.MOTORISTA_SVO, false, ['SVO']],
    [PERFIS.INTEGRANTE_SVO, false, ['SVO']],
  ] as const)('%s (associado ao SVO: %s) alcança %j em todas as rotas', async (perfil, associado, operacoes) => {
    entrarComo(perfil);
    vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(associado);
    for (const [metodo, caminho, corpo] of ROTAS) await chamar(metodo, caminho, corpo);

    const escopo = { usuarioId: 7, operacoes, acesso: ACESSO_POR_PERFIL[perfil] };
    for (const funcao of [modelo.listar, modelo.contarNaoLidas, modelo.marcarLida, modelo.marcarNaoLidas]) {
      expect(funcao).toHaveBeenCalled();
      for (const [recebido] of funcao.mock.calls) expect(recebido).toEqual(escopo);
    }
  });

  it('só o Gestor SVO gasta a consulta de associação', async () => {
    await chamar('get', '/contador');
    expect(unidadeModel.estaAssociadoPorNome).not.toHaveBeenCalled();
  });

  it.each(ROTAS)('%s %s ignora o usuário enviado pelo cliente', async (metodo, caminho, corpo) => {
    const destino = metodo === 'get' ? `${caminho}?usuario_id=99&user_id=99` : caminho;
    await chamar(metodo, destino, metodo === 'get' ? undefined : { ...corpo, usuario_id: 99, user_id: 99 });
    const chamadas = [modelo.listar, modelo.contarNaoLidas, modelo.marcarLida, modelo.marcarNaoLidas]
      .flatMap((funcao) => funcao.mock.calls as unknown[][]);
    expect(chamadas.length).toBeGreaterThan(0);
    for (const [escopo] of chamadas) expect(escopo).toMatchObject({ usuarioId: 7 });
  });

  it('as respostas não ficam no cache do navegador', async () => {
    expect((await chamar('get', '')).headers['cache-control']).toBe('no-store');
  });
});

describe('GET /notificacoes', () => {
  it('usa 20 por página e responde o contrato do front', async () => {
    const res = await chamar('get', '');
    expect(res.body).toEqual({ itens: [], proximo_cursor: null, nao_lidas: 3, versao: '3-120' });
    expect(modelo.listar).toHaveBeenCalledWith(expect.anything(), { limite: 20 });
  });

  it('o cursor devolvido serve para a página seguinte, com os microssegundos', async () => {
    const proximo = { em: '2026-11-24T17:00:00.123456Z', id: 42 };
    modelo.listar.mockResolvedValueOnce({ itens: [], proximo });
    const { body } = await chamar('get', '?limit=1&apenas_nao_lidas=true');
    expect(body.proximo_cursor).toBe('2026-11-24T17:00:00.123456Z|42');

    await chamar('get', `?cursor=${encodeURIComponent(body.proximo_cursor)}`);
    expect(modelo.listar).toHaveBeenLastCalledWith(expect.anything(), { limite: 20, cursor: proximo });
    expect(modelo.listar.mock.calls[0]![1]).toEqual({ limite: 1, apenasNaoLidas: true });
  });

  it.each([
    'limit=0', 'limit=51', 'limit=1.5', 'limit=abc', 'limit=', 'apenas_nao_lidas=sim',
    ...['', 'abc', '2026-11-24T17:00:00.000000Z', '2026-11-24T17:00:00Z|1', '2026-13-01T00:00:00.000000Z|1',
      '2026-02-30T00:00:00.000000Z|1', '2026-11-24T25:00:00.000000Z|1', '2026-11-24T17:00:00.000000Z|0',
      '2026-11-24T17:00:00.000000Z|2147483648', "2026-11-24T17:00:00.000000Z|1' OR 1=1", 'a|b|c',
    ].map((cursor) => `cursor=${encodeURIComponent(cursor)}`),
    'cursor=a&cursor=b',
  ])('recusa %s', async (consulta) => {
    const res = await chamar('get', `?${consulta}`);
    expect(res.status).toBe(400);
    expect(modelo.listar).not.toHaveBeenCalled();
  });
});

describe('Acesso ao registro', () => {
  const aviso = {
    id: 9, tipo: 'COLETA_DESIGNADA', titulo: 'Coleta nº 55', mensagem: 'Rua Reservada, 10', severidade: 'danger' as const,
    operacao: 'SVO' as const, referencia_tipo: 'ORDEM_SVO', referencia_id: 55, url_destino: '/minhas-coletas',
    lida_em: null, criado_em: new Date('2026-11-24T17:00:00Z'),
  };

  it('com acesso, o aviso vem inteiro', async () => {
    modelo.listar.mockResolvedValueOnce({ itens: [{ ...aviso, tem_acesso: true }] });
    const { body } = await chamar('get', '');
    expect(body.itens).toEqual([{ ...aviso, criado_em: '2026-11-24T17:00:00.000Z', acesso_revogado: false }]);
  });

  it('sem acesso, só sobra que houve um aviso', async () => {
    modelo.listar.mockResolvedValueOnce({ itens: [{ ...aviso, tem_acesso: false }] });
    const res = await chamar('get', '');
    expect(res.body.itens).toEqual([{
      id: 9, tipo: 'COLETA_DESIGNADA', titulo: 'Registro indisponível', mensagem: 'Você não tem mais acesso a este registro.',
      severidade: 'info', operacao: 'SVO', referencia_tipo: null, referencia_id: null, url_destino: '/',
      lida_em: null, criado_em: '2026-11-24T17:00:00.000Z', acesso_revogado: true,
    }]);
    expect(res.text).not.toMatch(/55|Reservada|minhas-coletas/);
  });
});

describe('GET /notificacoes/contador', () => {
  it('responde o total e uma versão, sem carregar a lista', async () => {
    const res = await chamar('get', '/contador');
    expect(res.body).toEqual({ nao_lidas: 3, versao: '3-120' });
    expect(modelo.listar).not.toHaveBeenCalled();
  });
});

describe('PATCH de leitura', () => {
  it('marca uma', async () => {
    const res = await chamar('patch', '/42/lida');
    expect(res.body).toEqual({ id: 42, lida_em: '2026-11-24T17:05:12.000Z', nao_lidas: 3, versao: '3-120' });
  });

  it('inexistente ou de outra pessoa: 404', async () => {
    modelo.marcarLida.mockResolvedValueOnce(undefined);
    const res = await chamar('patch', '/42/lida');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ erro: 'Notificação não encontrada' });
  });

  it.each(['0', '-1', 'abc', '1.5', '2147483648'])('id %s é recusado', async (id) => {
    expect((await chamar('patch', `/${id}/lida`)).status).toBe(400);
    expect(modelo.marcarLida).not.toHaveBeenCalled();
  });

  it('marca todas, sem corpo, ou só até a que o usuário viu', async () => {
    expect((await chamar('patch', '/ler-todas')).body).toEqual({ atualizadas: 2, nao_lidas: 3, versao: '3-120' });
    expect(modelo.marcarNaoLidas).toHaveBeenLastCalledWith(expect.anything(), { ateId: undefined });
    await chamar('patch', '/ler-todas', { ate_id: 42 });
    expect(modelo.marcarNaoLidas).toHaveBeenLastCalledWith(expect.anything(), { ateId: 42 });
    expect((await chamar('patch', '/ler-todas', { ate_id: 'x' })).status).toBe(400);
  });

  it('marca as da referência', async () => {
    const res = await chamar('patch', '/referencia/lida', { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 108 });
    expect(res.body).toEqual({ atualizadas: 2, nao_lidas: 3, versao: '3-120' });
    expect(modelo.marcarNaoLidas).toHaveBeenCalledWith(expect.anything(), { referencia: { tipo: 'VIAGEM_FROTA', id: 108 } });
    expect(modelo.marcarLida).not.toHaveBeenCalled();
  });

  it.each([
    {}, { referencia_tipo: 'VIAGEM_FROTA' }, { referencia_id: 1 }, { referencia_tipo: ' ', referencia_id: 1 },
    { referencia_tipo: 'VIAGEM', referencia_id: 1 }, { referencia_tipo: 'viagem_frota', referencia_id: 1 },
    { referencia_tipo: 'VIAGEM_FROTA', referencia_id: '1' }, { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 0 },
    { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 2147483648 },
  ])('referência inválida %j é recusada', async (corpo) => {
    expect((await chamar('patch', '/referencia/lida', corpo)).status).toBe(400);
    expect(modelo.marcarNaoLidas).not.toHaveBeenCalled();
  });
});
