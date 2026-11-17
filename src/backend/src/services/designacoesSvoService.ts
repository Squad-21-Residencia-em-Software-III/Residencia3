import type { Knex } from 'knex';
import { AppError } from '../errors/AppError';
import { PERFIS } from '../constants/perfis';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';

interface Designacao {
  ordemId: number; equipeId: number | null; integrantes: number[]; lotacao: number | null;
  inicio: Date; fim: Date; autorId: number;
}

/** Deve ser executado na transação que já detém a trava global da agenda SVO. */
export async function atualizarDesignacoesSvo(trx: Knex.Transaction, dados: Designacao): Promise<void> {
  const { ordemId, equipeId, integrantes, lotacao, inicio, fim, autorId } = dados;
  if (new Set(integrantes).size !== integrantes.length) throw new AppError('Integrante informado mais de uma vez', 400);
  if (!equipeId && integrantes.length) throw new AppError('Selecione uma equipe para designar integrantes', 400);
  if (equipeId && integrantes.length === 0) throw new AppError('Selecione pelo menos um integrante da equipe', 400);
  if (equipeId && (!Number.isInteger(lotacao) || lotacao! < 1 || integrantes.length > lotacao! - 1)) {
    throw new AppError('A lotação da cabine não comporta os integrantes selecionados', 409);
  }
  const ordem = await trx('ordens_svo').where({ id: ordemId }).forUpdate().first('data_hora_saida');
  if (!ordem) throw new AppError('Ordem SVO não encontrada', 404);
  if (ordem.data_hora_saida) throw new AppError('Não é possível alterar designações após o início real', 409);
  const anteriores: { id: number; usuario_id: number; equipe_id: number }[] = await trx('ordens_svo_integrantes')
    .where({ ordem_id: ordemId }).whereNull('revogado_em').forUpdate().select('id', 'usuario_id', 'equipe_id');
  if (equipeId) {
    const vinculados = await trx('equipes_svo_integrantes as v').join('usuarios as u', 'u.id', 'v.usuario_id')
      .where({ 'v.equipe_id': equipeId, 'u.perfil': PERFIS.INTEGRANTE_SVO, 'u.ativo': true })
      .whereNull('v.desvinculado_em').whereIn('u.id', integrantes).select('u.id').forUpdate('u', 'v');
    if (new Set(vinculados.map((v: { id: number }) => v.id)).size !== integrantes.length) {
      throw new AppError('Todos os integrantes devem possuir vínculo ativo com a equipe', 409);
    }
    const conflito = await trx('ordens_svo_integrantes as d').join('ordens_svo as o', 'o.id', 'd.ordem_id')
      .whereIn('d.usuario_id', integrantes).whereNull('d.revogado_em').whereNot('o.id', ordemId)
      .whereIn('o.status', ['ALOCADA', 'EM_DESLOCAMENTO'])
      .andWhere((q) => q.whereNull('o.inicio_previsto').orWhereNull('o.fim_previsto')
        .orWhere((q2) => q2.where('o.status', 'EM_DESLOCAMENTO').whereNull('o.data_hora_conclusao').where('o.fim_previsto', '<=', trx.fn.now()))
        .orWhere((q2) => q2.where('o.inicio_previsto', '<', fim).where('o.fim_previsto', '>', inicio)))
      .first('d.id');
    if (conflito) throw new AppError('Um integrante já está ocupado no período solicitado', 409, 'CONFLITO_AGENDA');
  }
  for (const anterior of anteriores) {
    if (anterior.equipe_id === equipeId && integrantes.includes(anterior.usuario_id)) continue;
    await trx('ordens_svo_integrantes').where({ id: anterior.id }).update({ revogado_em: trx.fn.now(), revogado_por: autorId });
    await auditoriaModel.registrar({ usuario_id: autorId, modulo: MODULOS_AUDITORIA.VIAGENS,
      acao: `REVOGOU_DESIGNACAO_SVO ordem=${ordemId} usuario=${anterior.usuario_id}` }, trx);
  }
  for (const usuarioId of integrantes) {
    if (anteriores.some((a) => a.equipe_id === equipeId && a.usuario_id === usuarioId)) continue;
    await trx('ordens_svo_integrantes').insert({ ordem_id: ordemId, equipe_id: equipeId, usuario_id: usuarioId,
      designado_em: trx.fn.now(), designado_por: autorId });
    await auditoriaModel.registrar({ usuario_id: autorId, modulo: MODULOS_AUDITORIA.VIAGENS,
      acao: `DESIGNOU_INTEGRANTE_SVO ordem=${ordemId} usuario=${usuarioId}` }, trx);
  }
}
