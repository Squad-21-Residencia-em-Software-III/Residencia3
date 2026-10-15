import { db } from '../config/database';
import { DESCRICAO_PERFIS, LISTA_PERFIS, PERFIS, tipoUsuarioDoPerfil, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { usuarioModel, type AlteracoesUsuario, type Usuario } from '../models/usuarioModel';
import type { AtualizarUsuarioInput, CriarUsuarioInput, ListarUsuariosInput } from '../validators/usuarioSchemas';
import { senhaService } from './senhaService';

export interface ListaPaginada<T> {
  dados: T[];
  paginacao: { pagina: number; limite: number; total: number; totalPaginas: number };
}

const EMAIL_EM_USO = 'Já existe um usuário cadastrado com este e-mail';

export const usuarioService = {
  listarPerfis(): { perfil: Perfil; descricao: string }[] {
    return LISTA_PERFIS.map((perfil) => ({ perfil, descricao: DESCRICAO_PERFIS[perfil] }));
  },

  async listar(filtros: ListarUsuariosInput): Promise<ListaPaginada<Usuario>> {
    const { dados, total } = await usuarioModel.listar(filtros);
    return {
      dados,
      paginacao: {
        pagina: filtros.pagina,
        limite: filtros.limite,
        total,
        totalPaginas: Math.ceil(total / filtros.limite),
      },
    };
  },

  async buscarPorId(id: number): Promise<Usuario> {
    const usuario = await usuarioModel.buscarPorId(id);
    if (!usuario) {
      throw new AppError('Usuário não encontrado', 404);
    }
    return usuario;
  },

  async criar(dados: CriarUsuarioInput, autorId: number): Promise<Usuario> {
    if (await usuarioModel.existeEmail(dados.email)) {
      throw new AppError(EMAIL_EM_USO, 409);
    }

    const hash = await senhaService.gerarHash(dados.senha);
    return db.transaction(async (trx) => {
      const usuario = await usuarioModel.criar(
        {
          nome: dados.nome,
          email: dados.email,
          senha: hash,
          perfil: dados.perfil,
          tipo_usuario: tipoUsuarioDoPerfil(dados.perfil),
          ativo: true,
        },
        trx,
      );
      await auditoriaModel.registrar(
        { usuario_id: autorId, acao: `CRIOU_USUARIO id=${usuario.id}`, modulo: MODULOS_AUDITORIA.USUARIOS },
        trx,
      );
      return usuario;
    });
  },

  async atualizar(id: number, dados: AtualizarUsuarioInput, autorId: number): Promise<Usuario> {
    await this.buscarPorId(id);

    if (id === autorId) {
      if (dados.ativo === false) {
        throw new AppError('Você não pode desativar a sua própria conta', 422);
      }
      if (dados.perfil && dados.perfil !== PERFIS.ADMINISTRADOR) {
        throw new AppError('Você não pode remover o perfil de administrador da sua própria conta', 422);
      }
    }

    if (dados.email && (await usuarioModel.existeEmail(dados.email, id))) {
      throw new AppError(EMAIL_EM_USO, 409);
    }

    const alteracoes: AlteracoesUsuario = { ...dados };
    if (dados.perfil) {
      alteracoes.tipo_usuario = tipoUsuarioDoPerfil(dados.perfil);
    }

    return db.transaction(async (trx) => {
      const usuario = await usuarioModel.atualizar(id, alteracoes, trx);
      if (!usuario) {
        throw new AppError('Usuário não encontrado', 404);
      }
      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `ATUALIZOU_USUARIO id=${id} campos=${Object.keys(dados).join(',')}`,
          modulo: MODULOS_AUDITORIA.USUARIOS,
        },
        trx,
      );
      return usuario;
    });
  },

  async redefinirSenha(id: number, novaSenha: string, autorId: number): Promise<void> {
    await this.buscarPorId(id);
    const hash = await senhaService.gerarHash(novaSenha);

    await db.transaction(async (trx) => {
      await usuarioModel.atualizar(id, { senha: hash }, trx);
      await auditoriaModel.registrar(
        { usuario_id: autorId, acao: `REDEFINIU_SENHA id=${id}`, modulo: MODULOS_AUDITORIA.USUARIOS },
        trx,
      );
    });
  },
};
