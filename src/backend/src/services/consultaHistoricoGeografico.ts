import { z } from 'zod';
import type { Knex } from 'knex';
import { db } from '../config/database';
import { PERFIS } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import {
  consultaHistoricoSchema, detalheHistoricoSchema, type AutorHistorico,
} from '../validators/historicoGeograficoSchemas';

// A consulta resolve vínculo atual do motorista e escopo por registro/unidade,
// aplica retenção e pagina as evidências antes de devolver a projeção.
type LerDetalheAutorizado = (
  trx: Knex.Transaction, autor: AutorHistorico, consulta: z.infer<typeof consultaHistoricoSchema>,
) => Promise<z.input<typeof detalheHistoricoSchema> | undefined>;

export async function consultarHistoricoGeografico(
  entrada: unknown, autor: AutorHistorico, lerDetalheAutorizado: LerDetalheAutorizado,
) {
  const consulta = consultaHistoricoSchema.parse(entrada);
  const perfis: readonly AutorHistorico['perfil'][] = consulta.operacao === 'ADMINISTRATIVA'
    ? [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.MOTORISTA_FROTA]
    : [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO, PERFIS.MOTORISTA_SVO];
  if (!perfis.includes(autor.perfil)) {
    throw new AppError('Perfil sem permissão para consultar evidências.', 403, 'HISTORICO_CONSULTA_NEGADA');
  }
  return db.transaction(async (trx) => {
    const dados = await lerDetalheAutorizado(trx, autor, consulta);
    if (dados === undefined) throw new AppError('Histórico geográfico não encontrado.', 404);
    const resultado = detalheHistoricoSchema.parse(dados);
    if (resultado.evidencias.length > consulta.limite) {
      throw new AppError('O resultado excedeu a paginação solicitada.', 500);
    }
    return { operacao: consulta.operacao, id: consulta.id, ...resultado };
  });
}
