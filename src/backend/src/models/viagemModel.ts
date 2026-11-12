
import type { Knex } from 'knex';
import { db } from '../config/database';
import type { TipoOperacao } from '../validators/viagemSchemas';

export type StatusViagem =
  | 'AGENDADA'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'CANCELADA';

export interface ViagemDetalhada {
  id: number;
  solicitacao_id: number;
  tipo_operacao: TipoOperacao;
  origem: string | null;
  destino: string | null;
  finalidade: string | null;
  solicitante_nome: string | null;
  inicio_previsto: Date | null;
  fim_previsto: Date | null;
  veiculo_id: number;
  veiculo_modelo: string;
  veiculo_placa: string;
  motorista_id: number;
  motorista_nome: string;
  km_inicial: number | null;
  km_final: number | null;
  data_hora_efetiva_saida: Date | null;
  data_hora_efetiva_chegada: Date | null;
  status: StatusViagem;
}

// Viagens administrativas e ordens SVO no mesmo formato.
// Os status das ordens SVO são convertidos para os equivalentes de viagem.
const VIAGENS_UNIFICADAS_SQL = `
  SELECT
    vf.id,
    vf.solicitacao_id,
    'ADMINISTRATIVA' AS tipo_operacao,
    sv.origem,
    sv.destino,
    sv.finalidade,
    us.nome AS solicitante_nome,
    sv.data_saida_desejada AS inicio_previsto,
    sv.data_chegada_desejada AS fim_previsto,
    vf.veiculo_id,
    v.modelo AS veiculo_modelo,
    v.placa AS veiculo_placa,
    vf.motorista_id,
    um.nome AS motorista_nome,
    vf.km_inicial,
    vf.km_final,
    vf.data_hora_efetiva_saida,
    vf.data_hora_efetiva_chegada,
    vf.status,
    m.usuario_id AS motorista_usuario_id
  FROM viagens_frota vf
  LEFT JOIN solicitacoes_viagem sv ON sv.id = vf.solicitacao_id
  LEFT JOIN usuarios us ON us.id = sv.solicitante_id
  LEFT JOIN veiculos v ON v.id = vf.veiculo_id
  LEFT JOIN motoristas m ON m.id = vf.motorista_id
  LEFT JOIN usuarios um ON um.id = m.usuario_id

  UNION ALL

  SELECT
    o.id,
    o.solicitacao_id,
    'SVO' AS tipo_operacao,
    NULL AS origem,
    ss.local_ocorrencia AS destino,
    NULL AS finalidade,
    ur.nome AS solicitante_nome,
    o.data_hora_chamado AS inicio_previsto,
    NULL AS fim_previsto,
    o.veiculo_id,
    v.modelo AS veiculo_modelo,
    v.placa AS veiculo_placa,
    o.motorista_id,
    um.nome AS motorista_nome,
    o.km_inicial,
    o.km_final,
    o.data_hora_saida AS data_hora_efetiva_saida,
    o.data_hora_conclusao AS data_hora_efetiva_chegada,
    CASE o.status
      WHEN 'ALOCADA' THEN 'AGENDADA'
      WHEN 'EM_DESLOCAMENTO' THEN 'EM_ANDAMENTO'
      ELSE o.status
    END AS status,
    m.usuario_id AS motorista_usuario_id
  FROM ordens_svo o
  LEFT JOIN solicitacoes_svo ss ON ss.id = o.solicitacao_id
  LEFT JOIN usuarios ur ON ur.id = ss.registrante_id
  LEFT JOIN veiculos v ON v.id = o.veiculo_id
  LEFT JOIN motoristas m ON m.id = o.motorista_id
  LEFT JOIN usuarios um ON um.id = m.usuario_id
  WHERE o.status <> 'AGUARDANDO_ALOCACAO'
`;

export const viagemModel = {
  async listar(
    tipos: TipoOperacao[],
    usuarioMotoristaId?: number
  ): Promise<ViagemDetalhada[]> {
    const consulta = db
      .select(
        'id',
        'solicitacao_id',
        'tipo_operacao',
        'origem',
        'destino',
        'finalidade',
        'solicitante_nome',
        'inicio_previsto',
        'fim_previsto',
        'veiculo_id',
        'veiculo_modelo',
        'veiculo_placa',
        'motorista_id',
        'motorista_nome',
        'km_inicial',
        'km_final',
        'data_hora_efetiva_saida',
        'data_hora_efetiva_chegada',
        'status'
      )
      .from(db.raw(`(${VIAGENS_UNIFICADAS_SQL}) AS viagens`))
      .whereIn('tipo_operacao', tipos);

    // Motoristas visualizam somente as próprias viagens.
    // Gestores continuam visualizando as viagens permitidas
    // para seus respectivos perfis.
    if (usuarioMotoristaId !== undefined) {
      consulta.where(
        'motorista_usuario_id',
        usuarioMotoristaId
      );
    }

    return consulta.orderByRaw(
      'inicio_previsto DESC NULLS LAST, id DESC'
    );
  },

  async buscarPorId(
    tipo: TipoOperacao,
    id: number,
    conexao: Knex = db
  ): Promise<ViagemDetalhada | undefined> {
    return conexao
      .select(
        'id',
        'solicitacao_id',
        'tipo_operacao',
        'origem',
        'destino',
        'finalidade',
        'solicitante_nome',
        'inicio_previsto',
        'fim_previsto',
        'veiculo_id',
        'veiculo_modelo',
        'veiculo_placa',
        'motorista_id',
        'motorista_nome',
        'km_inicial',
        'km_final',
        'data_hora_efetiva_saida',
        'data_hora_efetiva_chegada',
        'status'
      )
      .from(
        conexao.raw(
          `(${VIAGENS_UNIFICADAS_SQL}) AS viagens`
        )
      )
      .where({
        tipo_operacao: tipo,
        id,
      })
      .first();
  },
};
