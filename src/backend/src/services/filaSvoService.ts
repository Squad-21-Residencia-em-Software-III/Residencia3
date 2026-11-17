import type { Knex } from 'knex';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { ultimoDiaDaSolicitacao } from './disponibilidadeService';

interface OrdemFila {
  id: number;
  status: string;
  veiculo_id: number;
  motorista_id: number;
  equipe_id: number | null;
  capacidade_utilizada: number;
  inicio_previsto: Date | null;
  fim_previsto: Date | null;
  liberada_em: Date | null;
}

const disputa = (a: OrdemFila, b: OrdemFila) =>
  a.veiculo_id === b.veiculo_id || a.motorista_id === b.motorista_id ||
  (a.equipe_id !== null && a.equipe_id === b.equipe_id);

async function auditar(trx: Knex.Transaction, usuarioId: number, acao: string) {
  await auditoriaModel.registrar({ usuario_id: usuarioId, modulo: MODULOS_AUDITORIA.VIAGENS, acao }, trx);
}

/**
 * Recalcula a fila sob o lock global da agenda. Não registra saída, quilometragem
 * nem muda o status da ordem. O cliente deve obter o lock antes de chamar.
 */
export async function reavaliarFilaSvo(trx: Knex.Transaction, usuarioId: number): Promise<void> {
  const [{ agora }] = await trx.raw<{ rows: { agora: Date }[] }>('SELECT CURRENT_TIMESTAMP AS agora').then((r) => r.rows);
  const ordens: OrdemFila[] = await trx('ordens_svo')
    .whereIn('status', ['ALOCADA', 'EM_DESLOCAMENTO'])
    .select('id', 'status', 'veiculo_id', 'motorista_id', 'equipe_id', 'capacidade_utilizada',
      'inicio_previsto', 'fim_previsto', 'liberada_em')
    .orderBy('inicio_previsto', 'asc', 'last').orderBy('id');
  const emCurso = ordens.filter((o) => o.status === 'EM_DESLOCAMENTO');
  const candidatas = ordens.filter((o) => o.status === 'ALOCADA' && o.inicio_previsto && o.fim_previsto);
  const selecionadas: OrdemFila[] = [];

  for (const ordem of candidatas) {
    const inicio = new Date(ordem.inicio_previsto!);
    let livre = inicio <= agora && !emCurso.some((ativa) => disputa(ativa, ordem)) &&
      !selecionadas.some((outra) => disputa(outra, ordem));
    if (livre) {
      const veiculo = await trx('veiculos').where({ id: ordem.veiculo_id }).forUpdate()
        .first('status', 'tipo_frota', 'capacidade_maxima');
      const motorista = await trx('motoristas').where({ id: ordem.motorista_id }).forUpdate()
        .first('status', 'validade_cnh', 'tipo_motorista');
      const dataHoje = ultimoDiaDaSolicitacao({ data_saida_desejada: agora });
      const validade = motorista?.validade_cnh instanceof Date
        ? motorista.validade_cnh.toISOString().slice(0, 10) : String(motorista?.validade_cnh).slice(0, 10);
      livre = Boolean(veiculo && veiculo.tipo_frota === 'SVO' && veiculo.status !== 'MANUTENCAO' &&
        ordem.capacidade_utilizada > 0 && ordem.capacidade_utilizada <= 4 &&
        ordem.capacidade_utilizada <= veiculo.capacidade_maxima && motorista && motorista.tipo_motorista === 'SVO' &&
        !['INATIVO', 'AFASTADO'].includes(motorista.status) &&
        validade >= dataHoje);
      if (livre && ordem.equipe_id) {
        const equipe = await trx('equipes_svo').where({ id: ordem.equipe_id }).forUpdate().first('id');
        livre = Boolean(equipe);
      }
    }
    if (livre) selecionadas.push(ordem);
    if (livre && !ordem.liberada_em) {
      await trx('ordens_svo').where({ id: ordem.id }).update({ liberada_em: agora });
      await auditar(trx, usuarioId, `LIBEROU_ORDEM_SVO id=${ordem.id}`);
    } else if (!livre && ordem.liberada_em) {
      await trx('ordens_svo').where({ id: ordem.id }).update({ liberada_em: null });
      await auditar(trx, usuarioId, `BLOQUEOU_ORDEM_SVO id=${ordem.id}`);
    }
  }

  for (const anterior of emCurso) {
    if (!anterior.fim_previsto || new Date(anterior.fim_previsto) >= agora) continue;
    for (const afetada of candidatas) {
      if (!afetada.inicio_previsto || new Date(afetada.inicio_previsto) > agora || !disputa(anterior, afetada)) continue;
      const alerta = await trx('alertas_atraso_svo')
        .where({ ordem_em_atraso_id: anterior.id, ordem_afetada_id: afetada.id })
        .first('id', 'resolvido_em');
      if (!alerta) {
        await trx('alertas_atraso_svo').insert({ ordem_em_atraso_id: anterior.id, ordem_afetada_id: afetada.id });
        await auditar(trx, usuarioId, `ALERTA_ATRASO_SVO ordem=${anterior.id} afetada=${afetada.id}`);
      } else if (alerta.resolvido_em) {
        await trx('alertas_atraso_svo').where({ id: alerta.id }).update({ criado_em: agora, resolvido_em: null });
        await auditar(trx, usuarioId, `REABRIU_ALERTA_SVO ordem=${anterior.id} afetada=${afetada.id}`);
      }
    }
  }
}
