
import type { Knex } from 'knex';
import { db } from '../config/database';
import type { TipoOperacao } from '../validators/viagemSchemas';

export const LIMITE_MAXIMO_VIAGENS = 200;

function normalizarLimite(limite?: number): number {
  if (!limite || !Number.isInteger(limite) || limite <= 0) {
    return LIMITE_MAXIMO_VIAGENS;
  }
  return Math.min(limite, LIMITE_MAXIMO_VIAGENS);
}

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
  equipe_id: number | null;
  liberada_em: Date | null;
  capacidade_utilizada: number | null;
  km_inicial: number | null;
  km_final: number | null;
  data_hora_efetiva_saida: Date | null;
  data_hora_efetiva_chegada: Date | null;
  status: StatusViagem;
}

// Viagens administrativas e ordens SVO no mesmo formato.
// Os status das ordens SVO são convertidos para os equivalentes de viagem.
export const VIAGENS_UNIFICADAS_SQL = `
  SELECT
    vf.id,
    vf.solicitacao_id,
    'ADMINISTRATIVA' AS tipo_operacao,
    sv.origem,
    sv.destino,
    sv.finalidade,
    (to_jsonb(sv)->>'material_sensivel')::boolean AS material_sensivel,
    us.nome AS solicitante_nome,
    sv.data_saida_desejada AS inicio_previsto,
    sv.data_chegada_desejada AS fim_previsto,
    vf.veiculo_id,
    v.modelo AS veiculo_modelo,
    v.placa AS veiculo_placa,
    vf.motorista_id,
    um.nome AS motorista_nome,
    NULL::integer AS equipe_id,
    NULL::timestamptz AS liberada_em,
    NULL::integer AS capacidade_utilizada,
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
    NULL::boolean AS material_sensivel,
    ur.nome AS solicitante_nome,
    o.inicio_previsto,
    o.fim_previsto,
    o.veiculo_id,
    v.modelo AS veiculo_modelo,
    v.placa AS veiculo_placa,
    o.motorista_id,
    um.nome AS motorista_nome,
    o.equipe_id,
    (to_jsonb(o)->>'liberada_em')::timestamptz AS liberada_em,
    o.capacidade_utilizada,
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
  async listarOrdensPendentesSvo(pagina: number, limite: number) {
    const base = () => db('ordens_svo as o')
      .innerJoin('solicitacoes_svo as s', 's.id', 'o.solicitacao_id')
      .where('o.status', 'AGUARDANDO_ALOCACAO')
      .where('s.status', 'CONFIRMADA');
    const [dados, contagem] = await Promise.all([
      base().select('o.id as ordem_id', 'o.solicitacao_id', 's.local_ocorrencia',
        's.material_sensivel', 's.confirmado_em', 'o.status',
        'o.veiculo_id', 'o.motorista_id', 'o.equipe_id')
        .orderBy('s.confirmado_em', 'asc', 'last').orderBy('o.id', 'asc')
        .limit(limite).offset((pagina - 1) * limite),
      base().count<{ total: string }[]>({ total: 'o.id' }).first(),
    ]);
    const total = Number(contagem?.total ?? 0);
    return { dados, paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) } };
  },
  /** Consulta reduzida, vinculada ao solicitante autenticado antes da paginação. */
  async listarAdministrativasDoSolicitante(usuarioId: number, pagina: number, limite: number) {
    const base = () => db('viagens_frota as vf')
      .innerJoin('solicitacoes_viagem as sv', 'sv.id', 'vf.solicitacao_id')
      .where('sv.solicitante_id', usuarioId);
    const [dados, contagem] = await Promise.all([
      base()
        .select('vf.id', 'vf.solicitacao_id', 'sv.origem', 'sv.destino', 'sv.finalidade',
          'vf.status', 'vf.data_hora_efetiva_saida', 'vf.data_hora_efetiva_chegada')
        .select(db.raw("'ADMINISTRATIVA' as tipo_operacao"))
        .select(db.raw("(to_jsonb(sv)->>'material_sensivel')::boolean as material_sensivel"))
        .select('sv.data_saida_desejada as inicio_previsto', 'sv.data_chegada_desejada as fim_previsto')
        .orderBy('sv.data_saida_desejada', 'desc', 'last')
        .orderBy('vf.id', 'desc')
        .limit(limite).offset((pagina - 1) * limite),
      base().count<{ total: string }[]>({ total: 'vf.id' }).first(),
    ]);
    const total = Number(contagem?.total ?? 0);
    return { dados, paginacao: { pagina, limite, total, totalPaginas: Math.ceil(total / limite) } };
  },
  async listar(
    tipos: TipoOperacao[],
    usuarioMotoristaId?: number,
    limite = LIMITE_MAXIMO_VIAGENS
  ): Promise<ViagemDetalhada[]> {
    const consulta = db
      .select(
        'id',
        'solicitacao_id',
        'tipo_operacao',
        'origem',
        'destino',
        'finalidade',
        'material_sensivel',
        'solicitante_nome',
        'inicio_previsto',
        'fim_previsto',
        'veiculo_id',
        'veiculo_modelo',
        'veiculo_placa',
        'motorista_id',
        'motorista_nome',
        'equipe_id',
        'liberada_em',
        'capacidade_utilizada',
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

    return consulta
      .orderByRaw('inicio_previsto DESC NULLS LAST, id DESC')
      .limit(normalizarLimite(limite));
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
        'material_sensivel',
        'solicitante_nome',
        'inicio_previsto',
        'fim_previsto',
        'veiculo_id',
        'veiculo_modelo',
        'veiculo_placa',
        'motorista_id',
        'motorista_nome',
        'equipe_id',
        'liberada_em',
        'capacidade_utilizada',
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
