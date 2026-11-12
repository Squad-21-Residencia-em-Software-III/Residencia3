import { createHmac, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';
import { env } from '../config/env';
import type { Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { usuarioModel, type Usuario, type UsuarioComSenha } from '../models/usuarioModel';
import type { AlterarSenhaInput, LoginInput } from '../validators/authSchemas';
import { HASH_FICTICIO, senhaService } from './senhaService';

// Política de sessão (docs/seguranca-sessoes.md): somente HS256, emissor e público fixos
export const JWT_ALGORITMO = 'HS256';
export const JWT_EMISSOR = 'fsph-frotas-api';
export const JWT_PUBLICO = 'fsph-frotas-web';

type TipoToken = 'access' | 'refresh';

interface PayloadToken {
  sub: string;
  typ: TipoToken;
  perfil: Perfil;
  // Impressão digital da senha: muda quando a senha é alterada ou redefinida
  sh: string;
  // Fim absoluto da sessão (segundos); a renovação não o estende
  sessao_exp: number;
  iat: number;
  exp: number;
}

export interface ResultadoLogin {
  token: string;
  tipo: 'Bearer';
  expiraEm: string;
  refreshToken: string;
  refreshExpiraEm: string;
  usuario: Usuario;
}

const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos';
const TOKEN_INVALIDO = 'Token inválido ou expirado';

// Tentativas recusadas também são eventos de segurança (RN18). O e-mail digitado não é
// gravado: pode conter erro de digitação com dados sensíveis (ex.: a própria senha).
// Uma falha ao auditar não pode trocar a resposta de erro original por um 500.
async function registrarTentativaRecusada(usuarioId: number | null, acao: string): Promise<void> {
  try {
    await auditoriaModel.registrar({ usuario_id: usuarioId, acao, modulo: MODULOS_AUDITORIA.AUTENTICACAO });
  } catch (erro) {
    console.error('Falha ao registrar auditoria de autenticação:', erro);
  }
}

function impressaoDaSenha(usuarioId: number, hashSenha: string): string {
  return createHmac('sha256', env.jwtSecret).update(`${usuarioId}:${hashSenha}`).digest('base64url');
}

function mesmaImpressao(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

function assinar(usuario: UsuarioComSenha, typ: TipoToken, expiraEm: number, sessaoExp: number): string {
  return jwt.sign(
    { typ, perfil: usuario.perfil, sh: impressaoDaSenha(usuario.id, usuario.senha), sessao_exp: sessaoExp },
    env.jwtSecret,
    {
      algorithm: JWT_ALGORITMO,
      issuer: JWT_EMISSOR,
      audience: JWT_PUBLICO,
      subject: String(usuario.id),
      expiresIn: expiraEm,
    }
  );
}

// Emite o par de tokens. Na renovação, mantém o fim absoluto da sessão original.
function emitirSessao(usuario: UsuarioComSenha, sessaoExp?: number): ResultadoLogin {
  const agora = agoraEmSegundos();
  const fimDaSessao = sessaoExp ?? agora + env.jwtRefreshExpiraEmSegundos;
  const restante = fimDaSessao - agora;
  const { senha: _hash, ...usuarioPublico } = usuario;

  return {
    token: assinar(usuario, 'access', Math.min(env.jwtExpiraEmSegundos, restante), fimDaSessao),
    tipo: 'Bearer',
    expiraEm: env.jwtExpiresIn,
    refreshToken: assinar(usuario, 'refresh', restante, fimDaSessao),
    refreshExpiraEm: new Date(fimDaSessao * 1000).toISOString(),
    usuario: usuarioPublico,
  };
}

function payloadValido(payload: unknown, typ: TipoToken): payload is PayloadToken {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.typ === typ &&
    typeof p.sub === 'string' &&
    /^[1-9]\d*$/.test(p.sub) &&
    typeof p.sh === 'string' &&
    typeof p.iat === 'number' &&
    typeof p.exp === 'number' &&
    typeof p.sessao_exp === 'number' &&
    p.exp <= p.sessao_exp
  );
}

// Assinatura, algoritmo, emissor, público, expiração e formato do payload.
// O motivo da recusa não é exposto nem registrado em log.
function verificar(token: string, typ: TipoToken): PayloadToken {
  let payload: unknown;
  try {
    payload = jwt.verify(token, env.jwtSecret, {
      algorithms: [JWT_ALGORITMO],
      issuer: JWT_EMISSOR,
      audience: JWT_PUBLICO,
      clockTolerance: 5,
    });
  } catch {
    throw new AppError(TOKEN_INVALIDO, 401);
  }
  if (!payloadValido(payload, typ)) {
    throw new AppError(TOKEN_INVALIDO, 401);
  }
  return payload;
}

// Confere no banco que o usuário existe, continua ativo e não trocou a senha desde a emissão
async function usuarioDaSessao(payload: PayloadToken): Promise<UsuarioComSenha> {
  const usuario = await usuarioModel.buscarPorIdComSenha(Number(payload.sub));
  if (!usuario || !mesmaImpressao(payload.sh, impressaoDaSenha(usuario.id, usuario.senha))) {
    throw new AppError(TOKEN_INVALIDO, 401);
  }
  if (!usuario.ativo) {
    throw new AppError('Usuário inativo. Procure o administrador do sistema.', 403);
  }
  return usuario;
}

export const authService = {
  async login({ email, senha }: LoginInput): Promise<ResultadoLogin> {
    const usuario = await usuarioModel.buscarPorEmailComSenha(email);
    const senhaConfere = await senhaService.comparar(senha, usuario?.senha ?? HASH_FICTICIO);

    if (!usuario) {
      await registrarTentativaRecusada(null, 'LOGIN_FALHOU motivo=USUARIO_NAO_ENCONTRADO');
      throw new AppError(CREDENCIAIS_INVALIDAS, 401);
    }
    if (!senhaConfere) {
      await registrarTentativaRecusada(usuario.id, 'LOGIN_FALHOU motivo=SENHA_INCORRETA');
      throw new AppError(CREDENCIAIS_INVALIDAS, 401);
    }
    if (!usuario.ativo) {
      await registrarTentativaRecusada(usuario.id, 'LOGIN_RECUSADO motivo=USUARIO_INATIVO');
      throw new AppError('Usuário inativo. Procure o administrador do sistema.', 403);
    }

    const sessao = emitirSessao(usuario);

    await auditoriaModel.registrar({
      usuario_id: usuario.id,
      acao: 'LOGIN',
      modulo: MODULOS_AUDITORIA.AUTENTICACAO,
    });

    return sessao;
  },

  // Usuário e perfil vêm sempre do banco, nunca do payload do token
  async usuarioDoToken(token: string): Promise<Usuario> {
    const usuario = await usuarioDaSessao(verificar(token, 'access'));
    const { senha: _hash, ...usuarioPublico } = usuario;
    return usuarioPublico;
  },

  // Emite um novo par de tokens sem estender o fim da sessão aberta no login
  async renovarSessao(refreshToken: string): Promise<ResultadoLogin> {
    const payload = verificar(refreshToken, 'refresh');
    // A tolerância de relógio do verify não pode prolongar uma sessão já encerrada
    if (payload.sessao_exp <= agoraEmSegundos()) {
      throw new AppError(TOKEN_INVALIDO, 401);
    }
    const usuario = await usuarioDaSessao(payload);
    return emitirSessao(usuario, payload.sessao_exp);
  },

  // A troca de senha invalida as sessões anteriores; a sessão atual recebe tokens novos
  async alterarPropriaSenha(usuarioId: number, { senhaAtual, novaSenha }: AlterarSenhaInput): Promise<ResultadoLogin> {
    const usuario = await usuarioModel.buscarPorIdComSenha(usuarioId);
    if (!usuario || !(await senhaService.comparar(senhaAtual, usuario.senha))) {
      await registrarTentativaRecusada(usuarioId, 'ALTERACAO_SENHA_RECUSADA motivo=SENHA_ATUAL_INCORRETA');
      throw new AppError('Senha atual incorreta', 400);
    }

    const hash = await senhaService.gerarHash(novaSenha);
    await db.transaction(async (trx) => {
      await usuarioModel.atualizar(usuarioId, { senha: hash }, trx);
      await auditoriaModel.registrar(
        { usuario_id: usuarioId, acao: 'ALTEROU_PROPRIA_SENHA', modulo: MODULOS_AUDITORIA.AUTENTICACAO },
        trx,
      );
    });

    return emitirSessao({ ...usuario, senha: hash });
  },
};
