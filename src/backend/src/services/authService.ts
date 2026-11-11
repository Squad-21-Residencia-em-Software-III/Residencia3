import jwt, { type SignOptions } from 'jsonwebtoken';
import { db } from '../config/database';
import { env } from '../config/env';
import type { Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { usuarioModel, type Usuario } from '../models/usuarioModel';
import type { AlterarSenhaInput, LoginInput } from '../validators/authSchemas';
import { HASH_FICTICIO, senhaService } from './senhaService';

interface PayloadToken {
  sub: string;
  perfil: Perfil;
}

export interface ResultadoLogin {
  token: string;
  tipo: 'Bearer';
  expiraEm: string;
  usuario: Usuario;
}

const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos';

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

    const payload: Omit<PayloadToken, 'sub'> = { perfil: usuario.perfil };
    const token = jwt.sign(payload, env.jwtSecret, {
      subject: String(usuario.id),
      expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
    });

    await auditoriaModel.registrar({
      usuario_id: usuario.id,
      acao: 'LOGIN',
      modulo: MODULOS_AUDITORIA.AUTENTICACAO,
    });

    const { senha: _hash, ...usuarioPublico } = usuario;
    return { token, tipo: 'Bearer', expiraEm: env.jwtExpiresIn, usuario: usuarioPublico };
  },

  async usuarioDoToken(token: string): Promise<Usuario> {
    let payload: PayloadToken;
    try {
      payload = jwt.verify(token, env.jwtSecret) as PayloadToken;
    } catch {
      throw new AppError('Token inválido ou expirado', 401);
    }

    const usuario = await usuarioModel.buscarPorId(Number(payload.sub));
    if (!usuario) {
      throw new AppError('Token inválido ou expirado', 401);
    }
    if (!usuario.ativo) {
      throw new AppError('Usuário inativo. Procure o administrador do sistema.', 403);
    }
    return usuario;
  },

  async alterarPropriaSenha(usuarioId: number, { senhaAtual, novaSenha }: AlterarSenhaInput): Promise<void> {
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
  },
};
