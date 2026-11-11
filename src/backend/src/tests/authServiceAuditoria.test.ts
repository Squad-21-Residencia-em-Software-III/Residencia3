import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database', () => ({
  db: { transaction: vi.fn(async (callback: (trx: unknown) => unknown) => callback('trx')) },
}));

vi.mock('../models/usuarioModel', () => ({
  usuarioModel: {
    buscarPorEmailComSenha: vi.fn(),
    buscarPorIdComSenha: vi.fn(),
    atualizar: vi.fn(),
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

import { AppError } from '../errors/AppError';
import { auditoriaModel } from '../models/auditoriaModel';
import { usuarioModel } from '../models/usuarioModel';
import { authService } from '../services/authService';
import { senhaService } from '../services/senhaService';

type UsuarioComSenha = NonNullable<Awaited<ReturnType<typeof usuarioModel.buscarPorEmailComSenha>>>;

const usuario = (ativo = true) =>
  ({
    id: 7,
    nome: 'Gestor',
    email: 'gestor@exemplo.com',
    senha: 'hash',
    perfil: 'GESTOR_FROTA',
    tipo_usuario: 'GESTOR_FROTA',
    ativo,
  }) as unknown as UsuarioComSenha;

const credenciais = { email: 'gestor@exemplo.com', senha: 'Senha123' };

async function capturarErro(promessa: Promise<unknown>): Promise<AppError> {
  try {
    await promessa;
  } catch (erro) {
    return erro as AppError;
  }
  throw new Error('A operação deveria ter falhado');
}

describe('Auditoria de autenticação (RN18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('registra LOGIN quando a autenticação é bem-sucedida', async () => {
      vi.mocked(usuarioModel.buscarPorEmailComSenha).mockResolvedValueOnce(usuario());
      vi.mocked(senhaService.comparar).mockResolvedValueOnce(true);

      const resultado = await authService.login(credenciais);

      expect(resultado.token).toBeTruthy();
      expect(auditoriaModel.registrar).toHaveBeenCalledWith({
        usuario_id: 7,
        acao: 'LOGIN',
        modulo: 'AUTENTICACAO',
      });
    });

    it('registra falha por senha incorreta vinculada ao usuário e responde 401', async () => {
      vi.mocked(usuarioModel.buscarPorEmailComSenha).mockResolvedValueOnce(usuario());
      vi.mocked(senhaService.comparar).mockResolvedValueOnce(false);

      const erro = await capturarErro(authService.login(credenciais));

      expect(erro.statusCode).toBe(401);
      expect(erro.message).toBe('E-mail ou senha inválidos');
      expect(auditoriaModel.registrar).toHaveBeenCalledWith({
        usuario_id: 7,
        acao: 'LOGIN_FALHOU motivo=SENHA_INCORRETA',
        modulo: 'AUTENTICACAO',
      });
    });

    it('registra falha de usuário inexistente sem gravar o e-mail digitado', async () => {
      vi.mocked(usuarioModel.buscarPorEmailComSenha).mockResolvedValueOnce(undefined);
      vi.mocked(senhaService.comparar).mockResolvedValueOnce(false);

      const erro = await capturarErro(authService.login({ email: 'naoexiste@exemplo.com', senha: 'x' }));

      expect(erro.statusCode).toBe(401);
      expect(erro.message).toBe('E-mail ou senha inválidos');
      expect(auditoriaModel.registrar).toHaveBeenCalledWith({
        usuario_id: null,
        acao: 'LOGIN_FALHOU motivo=USUARIO_NAO_ENCONTRADO',
        modulo: 'AUTENTICACAO',
      });
      const { acao } = vi.mocked(auditoriaModel.registrar).mock.calls[0]![0];
      expect(acao).not.toContain('naoexiste');
    });

    it('registra login recusado de usuário inativo e responde 403', async () => {
      vi.mocked(usuarioModel.buscarPorEmailComSenha).mockResolvedValueOnce(usuario(false));
      vi.mocked(senhaService.comparar).mockResolvedValueOnce(true);

      const erro = await capturarErro(authService.login(credenciais));

      expect(erro.statusCode).toBe(403);
      expect(auditoriaModel.registrar).toHaveBeenCalledWith({
        usuario_id: 7,
        acao: 'LOGIN_RECUSADO motivo=USUARIO_INATIVO',
        modulo: 'AUTENTICACAO',
      });
    });

    it('mantém a resposta 401 mesmo se a gravação da auditoria falhar', async () => {
      const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(usuarioModel.buscarPorEmailComSenha).mockResolvedValueOnce(usuario());
      vi.mocked(senhaService.comparar).mockResolvedValueOnce(false);
      vi.mocked(auditoriaModel.registrar).mockRejectedValueOnce(new Error('banco indisponível'));

      const erro = await capturarErro(authService.login(credenciais));

      expect(erro.statusCode).toBe(401);
      expect(erroConsole).toHaveBeenCalled();
      erroConsole.mockRestore();
    });
  });

  describe('alterarPropriaSenha', () => {
    const dados = { senhaAtual: 'Errada123', novaSenha: 'NovaSenha123' };

    it('registra a tentativa recusada quando a senha atual está incorreta', async () => {
      vi.mocked(usuarioModel.buscarPorIdComSenha).mockResolvedValueOnce(usuario());
      vi.mocked(senhaService.comparar).mockResolvedValueOnce(false);

      const erro = await capturarErro(authService.alterarPropriaSenha(7, dados));

      expect(erro.statusCode).toBe(400);
      expect(usuarioModel.atualizar).not.toHaveBeenCalled();
      expect(auditoriaModel.registrar).toHaveBeenCalledWith({
        usuario_id: 7,
        acao: 'ALTERACAO_SENHA_RECUSADA motivo=SENHA_ATUAL_INCORRETA',
        modulo: 'AUTENTICACAO',
      });
    });

    it('registra a alteração bem-sucedida na mesma transação', async () => {
      vi.mocked(usuarioModel.buscarPorIdComSenha).mockResolvedValueOnce(usuario());
      vi.mocked(senhaService.comparar).mockResolvedValueOnce(true);
      vi.mocked(senhaService.gerarHash).mockResolvedValueOnce('novo-hash');

      await authService.alterarPropriaSenha(7, dados);

      expect(usuarioModel.atualizar).toHaveBeenCalledWith(7, { senha: 'novo-hash' }, 'trx');
      expect(auditoriaModel.registrar).toHaveBeenCalledWith(
        { usuario_id: 7, acao: 'ALTEROU_PROPRIA_SENHA', modulo: 'AUTENTICACAO' },
        'trx',
      );
    });
  });
});
