import type { Knex } from 'knex';
import { db } from '../config/database';
import type { Perfil } from '../constants/perfis';

export interface UsuarioComSenha {
  id: number;
  nome: string;
  email: string;
  senha: string;
  tipo_usuario: string;
  perfil: Perfil;
  ativo: boolean;
}

export type Usuario = Omit<UsuarioComSenha, 'senha'>;

export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  tipo_usuario: string;
  perfil: Perfil;
  ativo?: boolean;
}

export type AlteracoesUsuario = Partial<Omit<UsuarioComSenha, 'id'>>;

export interface FiltrosUsuarios {
  pagina: number;
  limite: number;
  busca?: string;
  perfil?: Perfil;
  ativo?: boolean;
}

const TABELA = 'usuarios';
const COLUNAS_PUBLICAS: (keyof Usuario)[] = ['id', 'nome', 'email', 'tipo_usuario', 'perfil', 'ativo'];

export const usuarioModel = {
  async listar(filtros: FiltrosUsuarios): Promise<{ dados: Usuario[]; total: number }> {
    const consulta = db<UsuarioComSenha>(TABELA).modify((q) => {
      if (filtros.busca) {
        const termo = `%${filtros.busca}%`;
        q.where((w) => w.whereILike('nome', termo).orWhereILike('email', termo));
      }
      if (filtros.perfil) q.where('perfil', filtros.perfil);
      if (filtros.ativo !== undefined) q.where('ativo', filtros.ativo);
    });

    const [dados, contagem] = await Promise.all([
      consulta
        .clone()
        .select(COLUNAS_PUBLICAS)
        .orderBy('nome')
        .limit(filtros.limite)
        .offset((filtros.pagina - 1) * filtros.limite),
      consulta.clone().count<{ total: string }[]>({ total: '*' }),
    ]);

    return { dados, total: Number(contagem[0]?.total ?? 0) };
  },

  async buscarPorId(id: number, conn: Knex = db): Promise<Usuario | undefined> {
    return conn<UsuarioComSenha>(TABELA).select(COLUNAS_PUBLICAS).where({ id }).first();
  },

  async buscarPorIdComSenha(id: number): Promise<UsuarioComSenha | undefined> {
    return db<UsuarioComSenha>(TABELA).where({ id }).first();
  },

  async buscarPorEmailComSenha(email: string): Promise<UsuarioComSenha | undefined> {
    return db<UsuarioComSenha>(TABELA).where({ email }).first();
  },

  async existeEmail(email: string, ignorarId?: number): Promise<boolean> {
    const encontrado = await db(TABELA)
      .select('id')
      .where({ email })
      .modify((q) => {
        if (ignorarId !== undefined) q.whereNot('id', ignorarId);
      })
      .first();
    return Boolean(encontrado);
  },

  async criar(dados: NovoUsuario, conn: Knex = db): Promise<Usuario> {
    const [criado] = await conn<UsuarioComSenha>(TABELA).insert(dados).returning(COLUNAS_PUBLICAS);
    return criado as Usuario;
  },

  async atualizar(id: number, alteracoes: AlteracoesUsuario, conn: Knex = db): Promise<Usuario | undefined> {
    const [atualizado] = await conn<UsuarioComSenha>(TABELA)
      .where({ id })
      .update(alteracoes)
      .returning(COLUNAS_PUBLICAS);
    return atualizado as Usuario | undefined;
  },
};
