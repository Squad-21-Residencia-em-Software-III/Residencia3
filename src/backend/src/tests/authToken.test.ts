import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../config/database', () => ({
  db: { transaction: vi.fn(async (callback: (trx: unknown) => unknown) => callback('trx')) },
}));

vi.mock('../models/usuarioModel', () => ({
  usuarioModel: {
    buscarPorEmailComSenha: vi.fn(),
    buscarPorIdComSenha: vi.fn(),
    atualizar: vi.fn(),
    incrementarVersaoSessao: vi.fn(),
  },
}));

vi.mock('../services/senhaService', () => ({
  HASH_FICTICIO: 'hash-ficticio',
  senhaService: { comparar: vi.fn(), gerarHash: vi.fn() },
}));

vi.mock('../models/auditoriaModel', async (importOriginal) => {
  const original = await importOriginal<typeof import('../models/auditoriaModel')>();
  return { ...original, auditoriaModel: { registrar: vi.fn() } };
});

import { env } from '../config/env';
import { usuarioModel } from '../models/usuarioModel';
import { authService, JWT_EMISSOR, JWT_PUBLICO } from '../services/authService';
import { senhaService } from '../services/senhaService';

type UsuarioComSenha = NonNullable<Awaited<ReturnType<typeof usuarioModel.buscarPorIdComSenha>>>;

let usuarioNoBanco: UsuarioComSenha | undefined;

const usuarioBase = (): UsuarioComSenha =>
  ({
    id: 7,
    nome: 'Gestor',
    email: 'gestor@exemplo.com',
    senha: '$2b$10$hash-atual',
    perfil: 'GESTOR_FROTA',
    tipo_usuario: 'GESTOR_FROTA',
    ativo: true,
    versao_sessao: 1,
  }) as UsuarioComSenha;

async function login() {
  vi.mocked(usuarioModel.buscarPorEmailComSenha).mockResolvedValue(usuarioNoBanco);
  vi.mocked(senhaService.comparar).mockResolvedValue(true);
  return authService.login({ email: 'gestor@exemplo.com', senha: 'Senha123' });
}

// Reassina um token com o payload original e opções alteradas, para simular adulterações
function reassinar(token: string, mudancas: Record<string, unknown> = {}, opcoes: jwt.SignOptions = {}, segredo = env.jwtSecret) {
  const { iat: _iat, exp, ...payload } = jwt.decode(token) as Record<string, unknown>;
  return jwt.sign({ ...payload, exp, ...mudancas }, segredo, { algorithm: 'HS256', ...opcoes });
}

async function erroDe(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    return erro as { statusCode: number; message: string };
  }
  throw new Error('A operação deveria ter falhado');
}

beforeEach(() => {
  vi.clearAllMocks();
  usuarioNoBanco = usuarioBase();
  vi.mocked(usuarioModel.buscarPorIdComSenha).mockImplementation(async () => usuarioNoBanco);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Emissão do token', () => {
  it('usa HS256, emissor, público, assunto e expiração definidos na política', async () => {
    const { resposta: { token }, refreshToken } = await login();
    const { header, payload } = jwt.decode(token, { complete: true }) as jwt.Jwt & { payload: jwt.JwtPayload };

    expect(header.alg).toBe('HS256');
    expect(payload).toMatchObject({ iss: JWT_EMISSOR, aud: JWT_PUBLICO, sub: '7', typ: 'access' });
    expect(payload.exp! - payload.iat!).toBe(env.jwtExpiraEmSegundos);
    expect(jwt.decode(refreshToken)).toMatchObject({ typ: 'refresh', sub: '7' });
  });

  it('não expõe a senha, o hash, a versão da sessão nem o refresh token na resposta', async () => {
    const sessao = await login();

    expect(JSON.stringify(sessao)).not.toContain(usuarioBase().senha);
    expect(JSON.stringify(jwt.decode(sessao.resposta.token))).not.toContain(usuarioBase().senha);
    expect(sessao.resposta.usuario).not.toHaveProperty('senha');
    expect(sessao.resposta.usuario).not.toHaveProperty('versao_sessao');
    expect(JSON.stringify(sessao.resposta)).not.toContain(sessao.refreshToken);
  });

  it('inclui a versão atual da sessão nos dois tokens', async () => {
    usuarioNoBanco = { ...usuarioBase(), versao_sessao: 4 };
    const { resposta, refreshToken } = await login();

    expect(jwt.decode(resposta.token)).toMatchObject({ sv: 4 });
    expect(jwt.decode(refreshToken)).toMatchObject({ sv: 4 });
  });
});

describe('Validação do access token', () => {
  it('aceita um token válido e devolve o usuário do banco, sem a senha', async () => {
    const { resposta: { token } } = await login();
    usuarioNoBanco = { ...usuarioBase(), perfil: 'ADMINISTRADOR' as UsuarioComSenha['perfil'] };

    const usuario = await authService.usuarioDoToken(token);

    // O perfil atual vem do banco, não do payload
    expect(usuario).toMatchObject({ id: 7, perfil: 'ADMINISTRADOR' });
    expect(usuario).not.toHaveProperty('senha');
  });

  it('rejeita token expirado', async () => {
    const { resposta: { token } } = await login();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (env.jwtExpiraEmSegundos + 60) * 1000);

    expect(await erroDe(authService.usuarioDoToken(token))).toMatchObject({ statusCode: 401 });
  });

  it('rejeita assinatura adulterada', async () => {
    const { resposta: { token } } = await login();
    const [cabecalho, , assinatura] = token.split('.');
    const payload = Buffer.from(JSON.stringify({ ...(jwt.decode(token) as object), perfil: 'ADMINISTRADOR' })).toString('base64url');

    expect(await erroDe(authService.usuarioDoToken(`${cabecalho}.${payload}.${assinatura}`))).toMatchObject({ statusCode: 401 });
  });

  it('rejeita token sem assinatura (alg none)', async () => {
    const { resposta: { token } } = await login();
    const semAssinatura = jwt.sign(jwt.decode(token) as object, '', { algorithm: 'none' });

    expect(await erroDe(authService.usuarioDoToken(semAssinatura))).toMatchObject({ statusCode: 401 });
  });

  it('rejeita algoritmo diferente de HS256, mesmo com o segredo correto', async () => {
    const { resposta: { token } } = await login();

    expect(await erroDe(authService.usuarioDoToken(reassinar(token, {}, { algorithm: 'HS512' })))).toMatchObject({
      statusCode: 401,
    });
  });

  it('rejeita token assinado com outro segredo', async () => {
    const { resposta: { token } } = await login();

    expect(await erroDe(authService.usuarioDoToken(reassinar(token, {}, {}, 'outro-segredo-com-mais-de-32-caracteres!')))).toMatchObject({
      statusCode: 401,
    });
  });

  it.each([
    ['emissor', { iss: 'outro-emissor' }],
    ['público', { aud: 'outro-publico' }],
    ['assunto não numérico', { sub: 'admin' }],
    ['assunto zero', { sub: '0' }],
    ['sem versão da sessão', { sv: undefined }],
    ['versão da sessão zero', { sv: 0 }],
    ['versão da sessão fracionária', { sv: 1.5 }],
    ['versão da sessão em texto', { sv: '1' }],
    ['expiração depois do fim da sessão', { sessao_exp: 1 }],
  ])('rejeita token com %s inválido', async (_caso, mudancas) => {
    const { resposta: { token } } = await login();

    expect(await erroDe(authService.usuarioDoToken(reassinar(token, mudancas)))).toMatchObject({ statusCode: 401 });
  });

  it('rejeita token sem expiração', async () => {
    const { resposta: { token } } = await login();
    const { iat: _iat, exp: _exp, ...payload } = jwt.decode(token) as Record<string, unknown>;

    expect(await erroDe(authService.usuarioDoToken(jwt.sign(payload, env.jwtSecret, { algorithm: 'HS256' })))).toMatchObject({
      statusCode: 401,
    });
  });

  it('rejeita refresh token usado como access token', async () => {
    const { refreshToken } = await login();

    expect(await erroDe(authService.usuarioDoToken(refreshToken))).toMatchObject({ statusCode: 401 });
  });

  it('rejeita token de usuário removido e mantém 403 para usuário inativo', async () => {
    const { resposta: { token } } = await login();

    usuarioNoBanco = { ...usuarioBase(), ativo: false };
    expect(await erroDe(authService.usuarioDoToken(token))).toMatchObject({ statusCode: 403 });

    usuarioNoBanco = undefined;
    expect(await erroDe(authService.usuarioDoToken(token))).toMatchObject({ statusCode: 401 });
  });

  it('usa a mesma mensagem genérica para qualquer motivo de recusa', async () => {
    const { resposta: { token }, refreshToken } = await login();
    const erros = await Promise.all([
      erroDe(authService.usuarioDoToken('abc')),
      erroDe(authService.usuarioDoToken(refreshToken)),
      erroDe(authService.usuarioDoToken(reassinar(token, { iss: 'x' }))),
    ]);

    expect(new Set(erros.map((e) => e.message))).toEqual(new Set(['Token inválido ou expirado']));
  });
});

describe('Invalidação de sessões (versao_sessao)', () => {
  const trocarSenha = () => authService.alterarPropriaSenha(7, { senhaAtual: 'Senha123', novaSenha: 'NovaSenha123' });

  beforeEach(() => {
    vi.mocked(senhaService.gerarHash).mockResolvedValue('$2b$10$hash-novo');
  });

  it('rejeita access e refresh emitidos antes da redefinição da senha', async () => {
    const { resposta: { token }, refreshToken } = await login();

    // Redefinição pelo administrador (ou troca em outro dispositivo): a versão é incrementada
    usuarioNoBanco = { ...usuarioBase(), versao_sessao: 2 };

    expect(await erroDe(authService.usuarioDoToken(token))).toMatchObject({ statusCode: 401 });
    expect(await erroDe(authService.renovarSessao(refreshToken))).toMatchObject({ statusCode: 401 });
  });

  it('não depende do hash da senha: só a versão da sessão invalida os tokens', async () => {
    const { resposta: { token } } = await login();
    usuarioNoBanco = { ...usuarioBase(), senha: '$2b$10$outro-hash' };

    await expect(authService.usuarioDoToken(token)).resolves.toMatchObject({ id: 7 });
  });

  it('incrementa a versão na mesma transação e entrega tokens novos para quem trocou a senha', async () => {
    const antiga = await login();
    vi.mocked(usuarioModel.incrementarVersaoSessao).mockResolvedValueOnce(2);

    const nova = await trocarSenha();
    usuarioNoBanco = { ...usuarioBase(), senha: '$2b$10$hash-novo', versao_sessao: 2 };

    expect(usuarioModel.incrementarVersaoSessao).toHaveBeenCalledWith(7, 'trx');
    await expect(authService.usuarioDoToken(nova.resposta.token)).resolves.toMatchObject({ id: 7 });
    await expect(authService.renovarSessao(nova.refreshToken)).resolves.toBeTruthy();
    expect(await erroDe(authService.usuarioDoToken(antiga.resposta.token))).toMatchObject({ statusCode: 401 });
    expect(await erroDe(authService.renovarSessao(antiga.refreshToken))).toMatchObject({ statusCode: 401 });
  });

  it('em trocas simultâneas, apenas a sessão com a versão mais recente continua válida', async () => {
    vi.mocked(senhaService.comparar).mockResolvedValue(true);
    vi.mocked(usuarioModel.incrementarVersaoSessao).mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    const [primeira, segunda] = await Promise.all([trocarSenha(), trocarSenha()]);
    usuarioNoBanco = { ...usuarioBase(), versao_sessao: 3 };

    expect(jwt.decode(primeira.resposta.token)).toMatchObject({ sv: 2 });
    expect(jwt.decode(segunda.resposta.token)).toMatchObject({ sv: 3 });
    expect(await erroDe(authService.usuarioDoToken(primeira.resposta.token))).toMatchObject({ statusCode: 401 });
    await expect(authService.usuarioDoToken(segunda.resposta.token)).resolves.toMatchObject({ id: 7 });
  });

  it('não emite tokens se o incremento da versão falhar', async () => {
    vi.mocked(senhaService.comparar).mockResolvedValue(true);
    vi.mocked(usuarioModel.incrementarVersaoSessao).mockRejectedValueOnce(new Error('falha no banco'));

    await expect(trocarSenha()).rejects.toThrow('falha no banco');
  });
});

describe('Renovação da sessão (refresh token)', () => {
  it('emite novo par de tokens sem estender o fim da sessão', async () => {
    const { refreshToken } = await login();
    const fimOriginal = (jwt.decode(refreshToken) as { sessao_exp: number }).sessao_exp;

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    const renovada = await authService.renovarSessao(refreshToken);

    expect(jwt.decode(renovada.refreshToken)).toMatchObject({ typ: 'refresh', sessao_exp: fimOriginal, exp: fimOriginal });
    await expect(authService.usuarioDoToken(renovada.resposta.token)).resolves.toMatchObject({ id: 7 });
  });

  it('limita o access renovado ao tempo restante da sessão', async () => {
    const { refreshToken } = await login();
    const fim = (jwt.decode(refreshToken) as { sessao_exp: number }).sessao_exp;

    vi.useFakeTimers();
    vi.setSystemTime((fim - 600) * 1000);
    const renovada = await authService.renovarSessao(refreshToken);

    expect((jwt.decode(renovada.resposta.token) as { exp: number }).exp).toBeLessThanOrEqual(fim);
  });

  it('rejeita refresh depois do fim da sessão', async () => {
    const { refreshToken } = await login();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (env.jwtRefreshExpiraEmSegundos + 60) * 1000);

    expect(await erroDe(authService.renovarSessao(refreshToken))).toMatchObject({ statusCode: 401 });
  });

  it('rejeita access token usado como refresh token', async () => {
    const { resposta: { token } } = await login();

    expect(await erroDe(authService.renovarSessao(token))).toMatchObject({ statusCode: 401 });
  });

  it('rejeita refresh de usuário inativo', async () => {
    const { refreshToken } = await login();
    usuarioNoBanco = { ...usuarioBase(), ativo: false };

    expect(await erroDe(authService.renovarSessao(refreshToken))).toMatchObject({ statusCode: 403 });
  });
});

describe('Logs', () => {
  it('não registra token nem segredo ao recusar tokens', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined)
    );
    const { resposta: { token }, refreshToken } = await login();

    await erroDe(authService.usuarioDoToken(reassinar(token, {}, { algorithm: 'HS512' })));
    await erroDe(authService.usuarioDoToken(refreshToken));
    await erroDe(authService.renovarSessao(token));

    const registrado = JSON.stringify(espioes.flatMap((e) => e.mock.calls));
    expect(registrado).not.toContain(token);
    expect(registrado).not.toContain(refreshToken);
    expect(registrado).not.toContain(env.jwtSecret);
    espioes.forEach((e) => e.mockRestore());
  });
});
