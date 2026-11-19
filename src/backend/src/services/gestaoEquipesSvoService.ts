import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';

export const gestaoEquipesSvoService = {
  async listar() {
    return db('equipes_svo').select('id', 'nome_equipe').orderBy('nome_equipe').orderBy('id');
  },
  async buscar(id: number) {
    const equipe = await db('equipes_svo').where({ id }).first('id', 'nome_equipe');
    if (!equipe) throw new AppError('Equipe SVO não encontrada', 404);
    return equipe;
  },
  async salvar(nome: string, autorId: number, id?: number) {
    return db.transaction(async (trx) => {
      // Serializa alterações realizadas pela aplicação até existir índice único no banco.
      await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [196, 1]);
      if (id !== undefined && !await trx('equipes_svo').where({ id }).forUpdate().first('id')) {
        throw new AppError('Equipe SVO não encontrada', 404);
      }
      const duplicada = await trx('equipes_svo')
        .whereRaw('lower(btrim(nome_equipe)) = lower(?)', [nome])
        .modify((query) => { if (id !== undefined) query.whereNot({ id }); })
        .first('id');
      if (duplicada) throw new AppError('Já existe uma equipe SVO com este nome', 409);
      const [equipe] = id === undefined
        ? await trx('equipes_svo').insert({ nome_equipe: nome }).returning(['id', 'nome_equipe'])
        : await trx('equipes_svo').where({ id }).update({ nome_equipe: nome }).returning(['id', 'nome_equipe']);
      await auditoriaModel.registrar({ usuario_id: autorId, modulo: MODULOS_AUDITORIA.USUARIOS,
        acao: `${id === undefined ? 'CRIOU' : 'ATUALIZOU'}_EQUIPE_SVO id=${equipe.id}` }, trx);
      return equipe;
    });
  },
};
