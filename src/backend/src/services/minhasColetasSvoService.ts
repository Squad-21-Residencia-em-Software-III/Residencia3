import { db } from '../config/database';
import { ORDENS_SVO_COM_RESERVA } from '../constants/statusOrdemSvo';

export async function listarMinhasColetasSvo(usuarioId: number, pagina: number, limite: number) {
  const consulta = () => db('ordens_svo_integrantes as d')
    .join('ordens_svo as o', 'o.id', 'd.ordem_id')
    .leftJoin('solicitacoes_svo as s', 's.id', 'o.solicitacao_id')
    .leftJoin('veiculos as v', 'v.id', 'o.veiculo_id')
    .leftJoin('motoristas as m', 'm.id', 'o.motorista_id')
    .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
    .where('d.usuario_id', usuarioId).whereNull('d.revogado_em')
    .whereIn('o.status', [...ORDENS_SVO_COM_RESERVA, 'CONCLUIDA']);
  const [dados, contagem] = await Promise.all([
    consulta().select('o.id', 'o.status', 'o.inicio_previsto', 'o.fim_previsto', 'o.data_hora_saida',
      'o.data_hora_conclusao', 's.local_ocorrencia as origem', 'v.modelo as veiculo_modelo',
      'v.placa as veiculo_placa', 'u.nome as motorista_nome')
      .orderBy('o.inicio_previsto', 'desc', 'last').orderBy('o.id', 'desc').limit(limite).offset((pagina - 1) * limite),
    consulta().count<{ total: string }[]>({ total: 'o.id' }).first(),
  ]);
  const total = Number(contagem?.total ?? 0);
  return { dados, paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) } };
}
