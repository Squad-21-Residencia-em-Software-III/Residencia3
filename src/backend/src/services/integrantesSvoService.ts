import { db } from '../config/database';
import { PERFIS } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { travarAgendaSvo } from './agendaSvoService';
import { usuarioService } from './usuarioService';
import type { CriarUsuarioInput } from '../validators/usuarioSchemas';

async function auditar(trx: import('knex').Knex.Transaction, autor: number, acao: string) {
  await auditoriaModel.registrar({ usuario_id: autor, modulo: MODULOS_AUDITORIA.USUARIOS, acao }, trx);
}

export const integrantesSvoService = {
  async criar(dados: Omit<CriarUsuarioInput, 'perfil'>, autor: number) {
    return usuarioService.criar({ ...dados, perfil: PERFIS.INTEGRANTE_SVO }, autor);
  },
  async listar() {
    return db('usuarios').where({ perfil: PERFIS.INTEGRANTE_SVO, ativo: true })
      .select('id', 'nome', 'email').orderBy('nome').orderBy('id');
  },
  async listarEquipe(equipeId: number) {
    const equipe = await db('equipes_svo').where({ id: equipeId }).first('id');
    if (!equipe) throw new AppError('Equipe SVO não encontrada', 404);
    return db('equipes_svo_integrantes as v').join('usuarios as u', 'u.id', 'v.usuario_id')
      .where({ 'v.equipe_id': equipeId, 'u.perfil': PERFIS.INTEGRANTE_SVO, 'u.ativo': true })
      .whereNull('v.desvinculado_em').select('u.id', 'u.nome', 'u.email').orderBy('u.nome');
  },
  async vincular(equipeId: number, usuarioId: number, autor: number) {
    return db.transaction(async (trx) => {
      await travarAgendaSvo(trx);
      if (!await trx('equipes_svo').where({ id: equipeId }).forUpdate().first('id')) throw new AppError('Equipe SVO não encontrada', 404);
      if (!await trx('usuarios').where({ id: usuarioId, perfil: PERFIS.INTEGRANTE_SVO, ativo: true }).forUpdate().first('id')) {
        throw new AppError('Integrante SVO ativo não encontrado', 404);
      }
      if (await trx('equipes_svo_integrantes').where({ equipe_id: equipeId, usuario_id: usuarioId }).whereNull('desvinculado_em').first('id')) {
        throw new AppError('Integrante já vinculado à equipe', 409);
      }
      await trx('equipes_svo_integrantes').insert({ equipe_id: equipeId, usuario_id: usuarioId, vinculado_em: trx.fn.now() });
      await auditar(trx, autor, `VINCULOU_INTEGRANTE_SVO equipe=${equipeId} usuario=${usuarioId}`);
    });
  },
  async desvincular(equipeId: number, usuarioId: number, autor: number) {
    return db.transaction(async (trx) => {
      await travarAgendaSvo(trx);
      const vinculo = await trx('equipes_svo_integrantes').where({ equipe_id: equipeId, usuario_id: usuarioId })
        .whereNull('desvinculado_em').forUpdate().first('id');
      if (!vinculo) throw new AppError('Vínculo ativo não encontrado', 404);
      const pendente = await trx('ordens_svo_integrantes as d').join('ordens_svo as o', 'o.id', 'd.ordem_id')
        .where({ 'd.equipe_id': equipeId, 'd.usuario_id': usuarioId }).whereNull('d.revogado_em')
        .where('o.status', 'ALOCADA').whereNull('o.data_hora_saida').first('d.id');
      if (pendente) throw new AppError('Regularize as designações futuras antes de desvincular o integrante', 409);
      await trx('equipes_svo_integrantes').where({ id: vinculo.id }).update({ desvinculado_em: trx.fn.now() });
      await auditar(trx, autor, `DESVINCULOU_INTEGRANTE_SVO equipe=${equipeId} usuario=${usuarioId}`);
    });
  },
};
