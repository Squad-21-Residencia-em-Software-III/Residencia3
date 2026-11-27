import type { Knex } from 'knex';
import { db } from '../config/database';
import { PERFIS } from '../constants/perfis';
import { LIMITE_LINHAS_EXPORTACAO } from '../constants/relatorios';
import { AppError } from '../errors/AppError';
import { gerarCsv } from '../exportadores/csvExportador';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { evidenciaGeograficaSchema, referenciaHistoricoSchema, type AutorHistorico, type EvidenciaGeografica, type ReferenciaHistorico } from '../validators/historicoGeograficoSchemas';

// A leitura SQL deve aplicar vínculo atual por registro/unidade e retenção
// nesta transação. A referência tipada distingue IDs de operações diferentes.
type LerEvidenciasExportaveis = (
  trx: Knex.Transaction, autor: AutorHistorico, referencia: ReferenciaHistorico, limite: number,
) => Promise<EvidenciaGeografica[] | undefined>;

const colunas = [
  { chave: 'tipo', titulo: 'Tipo', tipo: 'texto' },
  { chave: 'marco', titulo: 'Marco', tipo: 'texto' },
  { chave: 'capturadoEm', titulo: 'Capturado em (ISO 8601)', tipo: 'texto' },
  { chave: 'recebidoEm', titulo: 'Recebido em (ISO 8601)', tipo: 'texto' },
  { chave: 'latitude', titulo: 'Latitude', tipo: 'decimal', casasDecimaisCsv: 6 },
  { chave: 'longitude', titulo: 'Longitude', tipo: 'decimal', casasDecimaisCsv: 6 },
  { chave: 'precisaoMetros', titulo: 'Precisão (m)', tipo: 'decimal' },
] as const;

export async function exportarEvidenciasGeograficas(
  entrada: unknown, autor: AutorHistorico, lerEvidenciasExportaveis: LerEvidenciasExportaveis,
) {
  const referencia = referenciaHistoricoSchema.parse(entrada);
  const gestor = referencia.operacao === 'ADMINISTRATIVA' ? PERFIS.GESTOR_FROTA : PERFIS.GESTOR_SVO;
  if (autor.perfil !== PERFIS.ADMINISTRADOR && autor.perfil !== gestor) {
    throw new AppError('Perfil sem permissão para exportar evidências.', 403, 'HISTORICO_EXPORTACAO_NEGADA');
  }
  return db.transaction(async (trx) => {
    const pontos = await lerEvidenciasExportaveis(trx, autor, referencia, LIMITE_LINHAS_EXPORTACAO + 1);
    if (pontos === undefined) throw new AppError('Histórico geográfico não encontrado.', 404);
    if (pontos.length > LIMITE_LINHAS_EXPORTACAO) {
      throw new AppError('O histórico excede o limite de linhas da exportação.', 422);
    }

    const linhas = pontos.map((ponto) => {
      const { coordenadas, ...dados } = evidenciaGeograficaSchema.parse(ponto);
      return {
        ...dados,
        latitude: dados.tipo === 'LACUNA' ? null : coordenadas?.latitude,
        longitude: dados.tipo === 'LACUNA' ? null : coordenadas?.longitude,
        precisaoMetros: dados.tipo === 'LACUNA' ? null : dados.precisaoMetros,
      };
    });
    const conteudo = gerarCsv({ titulo: 'Evidências geográficas', colunas: [...colunas], linhas });

    await auditoriaModel.registrar({
      usuario_id: autor.id,
      acao: `EXPORTOU_HISTORICO_GEOGRAFICO operacao=${referencia.operacao} registro=${referencia.id} linhas=${linhas.length}`,
      modulo: MODULOS_AUDITORIA.RELATORIOS,
    }, trx);
    return {
      nomeArquivo: `historico-${referencia.operacao.toLowerCase()}-${referencia.id}.csv`,
      contentType: 'text/csv; charset=utf-8',
      conteudo,
    };
  });
}
