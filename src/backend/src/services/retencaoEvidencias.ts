import type { Knex } from 'knex';
import { TABELA_ARQUIVOS_ODOMETRO } from './armazenamentoEvidenciasPostgres';
import { VALIDADE_PROVISORIA_MS } from './evidenciaOdometroTransicao';

const MINUTOS_LIMPEZA_STAGING = VALIDADE_PROVISORIA_MS / 60_000;

interface Candidata {
  id: number;
  status: 'STAGING' | 'ATIVA';
}

function candidatas(db: Knex | Knex.Transaction) {
  return db<Candidata>('evidencias_odometro as e')
    .where('e.modalidade', 'FOTO')
    .where('e.preservacao_legal', false)
    .whereExists(db(TABELA_ARQUIVOS_ODOMETRO).select('evidencia_id').whereRaw('?? = ??', ['evidencia_id', 'e.id']))
    .where((consulta) => {
      consulta.where((staging) => staging.where('e.status', 'STAGING')
        .whereRaw("e.criado_em <= CURRENT_TIMESTAMP - (? * interval '1 minute')", [MINUTOS_LIMPEZA_STAGING]))
        .orWhere((retida) => retida.where('e.status', 'ATIVA')
          .whereNotNull('e.conclusao_operacao_em')
          .where('e.retencao_ate', '<=', db.fn.now())
          .whereRaw(`(
            (e.tipo_operacao = 'ADMINISTRATIVA' AND EXISTS (
              SELECT 1 FROM viagens_frota v
              WHERE v.id = e.viagem_frota_id AND v.status = 'CONCLUIDA'
                AND v.data_hora_efetiva_chegada <= e.conclusao_operacao_em
            ))
            OR (e.tipo_operacao = 'SVO' AND EXISTS (
              SELECT 1 FROM deslocamentos_svo d
              WHERE d.id = e.deslocamento_svo_id AND d.status = 'CONCLUIDO'
                AND d.data_hora_conclusao <= e.conclusao_operacao_em
            ) AND NOT EXISTS (
              SELECT 1 FROM deslocamentos_svo_ordens dor JOIN ordens_svo o ON o.id = dor.ordem_svo_id
              WHERE dor.deslocamento_svo_id = e.deslocamento_svo_id
                AND o.status NOT IN ('CONCLUIDA', 'CANCELADA')
            ))
          )`));
    });
}

export async function processarRetencaoEvidencias(
  db: Knex,
  opcoes: { aplicar: boolean; limite: number },
) {
  if (!Number.isInteger(opcoes.limite) || opcoes.limite < 1 || opcoes.limite > 100) {
    throw new Error('O lote de retenção deve conter de 1 a 100 candidatos');
  }
  const lote = await candidatas(db).select('e.id', 'e.status')
    .orderByRaw('COALESCE(e.retencao_ate, e.criado_em), e.id').limit(opcoes.limite);
  const resultado = {
    candidatos: lote.length,
    temporarias: lote.filter(({ status }) => status === 'STAGING').length,
    vencidas: lote.filter(({ status }) => status === 'ATIVA').length,
    removidas: 0,
    falhas: 0,
  };
  if (!opcoes.aplicar) return resultado;

  for (const { id } of lote) {
    try {
      const removeu = await db.transaction(async (trx) => {
        // A confirmação de uma foto e a alteração de preservação usam a mesma linha.
        const foto = await candidatas(trx).where('e.id', id)
          .forUpdate('e').skipLocked().first('e.id', 'e.status');
        if (!foto) return false;

        // Arquivo e metadados são alterados na mesma transação.
        if (!await trx(TABELA_ARQUIVOS_ODOMETRO).where({ evidencia_id: id }).del()) return false;
        await trx('evidencias_odometro').where({ id }).update(foto.status === 'STAGING'
          ? { status: 'REJEITADA' }
          : {
              status: 'EXPURGADA_RETENCAO', storage_key: null, expurgado_em: trx.fn.now(),
              expurgo_motivo: 'PRAZO_RETENCAO_12_MESES',
            });
        return true;
      });
      if (removeu) resultado.removidas++;
    } catch {
      // Mantém a linha e os bytes elegíveis para retry após rollback.
      resultado.falhas++;
    }
  }
  return resultado;
}
