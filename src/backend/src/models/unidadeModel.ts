import type { Knex } from 'knex';
import { db } from '../config/database';
import type { NomeUnidade, TipoUnidade } from '../constants/unidades';

export interface Unidade {
  id: number;
  nome: NomeUnidade;
  tipo: TipoUnidade;
}

export interface GestorAssociado {
  id: number;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface UnidadeComGestores extends Unidade {
  gestores: GestorAssociado[];
}

export const unidadeModel = {
  async listar(conexao: Knex = db): Promise<Unidade[]> {
    return conexao<Unidade>('unidades').select('id', 'nome', 'tipo').orderBy('id');
  },

  async listarComGestores(conexao: Knex = db): Promise<UnidadeComGestores[]> {
    const [unidades, associacoes] = await Promise.all([
      this.listar(conexao),
      conexao('gestores_unidades as gu')
        .join('usuarios as u', 'u.id', 'gu.usuario_id')
        .select('gu.unidade_id', 'u.id', 'u.nome', 'u.email', 'u.ativo')
        .orderBy('u.nome'),
    ]);

    return unidades.map((unidade) => ({
      ...unidade,
      gestores: associacoes
        .filter((a: { unidade_id: number }) => a.unidade_id === unidade.id)
        .map(({ id, nome, email, ativo }: GestorAssociado) => ({ id, nome, email, ativo })),
    }));
  },

  async buscarPorId(id: number, conexao: Knex = db): Promise<Unidade | undefined> {
    return conexao<Unidade>('unidades').select('id', 'nome', 'tipo').where({ id }).first();
  },

  async buscarComGestores(id: number, conexao: Knex = db): Promise<UnidadeComGestores | undefined> {
    const unidades = await this.listarComGestores(conexao);
    return unidades.find((unidade) => unidade.id === id);
  },

  async estaAssociado(unidadeId: number, usuarioId: number, conexao: Knex = db): Promise<boolean> {
    const encontrado = await conexao('gestores_unidades')
      .select('unidade_id')
      .where({ unidade_id: unidadeId, usuario_id: usuarioId })
      .first();
    return Boolean(encontrado);
  },

  async idsDasUnidadesDoGestor(usuarioId: number, conexao: Knex = db): Promise<number[]> {
    const linhas = await conexao('gestores_unidades').select('unidade_id').where({ usuario_id: usuarioId });
    return linhas.map((linha: { unidade_id: number }) => linha.unidade_id);
  },

  async associar(unidadeId: number, usuarioId: number, conexao: Knex = db): Promise<void> {
    await conexao('gestores_unidades').insert({ unidade_id: unidadeId, usuario_id: usuarioId });
  },

  // Retorna se havia associação para remover
  async desassociar(unidadeId: number, usuarioId: number, conexao: Knex = db): Promise<boolean> {
    const removidas = await conexao('gestores_unidades')
      .where({ unidade_id: unidadeId, usuario_id: usuarioId })
      .delete();
    return removidas > 0;
  },

  // Remove as associações de um usuário a unidades que o perfil dele não pode gerir
  async removerAssociacoesInvalidas(
    usuarioId: number,
    nomesPermitidos: NomeUnidade[],
    conexao: Knex = db
  ): Promise<number> {
    return conexao('gestores_unidades')
      .where({ usuario_id: usuarioId })
      .modify((q) => {
        if (nomesPermitidos.length > 0) {
          q.whereNotIn('unidade_id', conexao('unidades').select('id').whereIn('nome', nomesPermitidos));
        }
      })
      .delete();
  },
};
