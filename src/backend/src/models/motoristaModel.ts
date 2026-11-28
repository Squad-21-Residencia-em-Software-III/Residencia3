import type { Knex } from 'knex';
import { db } from '../config/database';
import { sqlCnhCanonica } from '../constants/cnh';
import type { ListarMotoristasFiltros } from '../validators/motoristaSchemas';

export type StatusMotorista = 'DISPONIVEL' | 'EM_VIAGEM' | 'INATIVO' | 'AFASTADO' | 'DESIGNADO';
export type TipoMotorista = 'FROTA' | 'SVO';

export interface Motorista {
  id: number;
  usuario_id: number;
  numero_cnh: string;
  categoria_cnh: string;
  validade_cnh: string;
  tipo_motorista: TipoMotorista;
  status: StatusMotorista;
}

export interface MotoristaComNome extends Motorista {
  nome: string;
}

/** Item da lista: o número da CNH sai só com os 4 dígitos finais (SCRUM-308). */
export interface MotoristaResumo extends Omit<MotoristaComNome, 'numero_cnh'> {
  cnh_final: string;
}

export interface UsuarioElegivel {
  id: number;
  nome: string;
  perfil: string;
}

export interface UsuarioParaMotorista {
  id: number;
  perfil: string;
  ativo: boolean;
}

export interface DadosNovoMotorista {
  usuario_id: number;
  numero_cnh: string;
  categoria_cnh: string;
  validade_cnh: string;
  tipo_motorista: TipoMotorista;
}

export type AlteracoesCnh = Partial<Pick<Motorista, 'numero_cnh' | 'categoria_cnh' | 'validade_cnh'>>;

const PERFIL_DO_TIPO: Record<TipoMotorista, string> = { FROTA: 'MOTORISTA_FROTA', SVO: 'MOTORISTA_SVO' };

function colunasDetalhe(conexao: Knex | Knex.Transaction) {
  return [
    'm.id',
    'm.usuario_id',
    'u.nome',
    'm.numero_cnh',
    'm.categoria_cnh',
    // Mantém a data no formato AAAA-MM-DD, sem conversão de fuso
    conexao.raw("to_char(m.validade_cnh, 'YYYY-MM-DD') as validade_cnh"),
    'm.tipo_motorista',
    'm.status',
  ];
}

export const motoristaModel = {
  async listar(filtros: ListarMotoristasFiltros): Promise<MotoristaResumo[]> {
    const consulta = db('motoristas as m')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .select(
        'm.id',
        'm.usuario_id',
        'u.nome',
        db.raw(`right(${sqlCnhCanonica('m.numero_cnh')}, 4) as cnh_final`),
        'm.categoria_cnh',
        db.raw("to_char(m.validade_cnh, 'YYYY-MM-DD') as validade_cnh"),
        'm.tipo_motorista',
        'm.status'
      )
      .orderBy('u.nome', 'asc');

    if (filtros.status) {
      consulta.where('m.status', filtros.status);
    }
    if (filtros.tipo_motorista) {
      consulta.where('m.tipo_motorista', filtros.tipo_motorista);
    }

    return consulta;
  },

  buscarPorId(id: number, trx?: Knex.Transaction): Promise<Motorista | undefined> {
    const conexao = trx || db;
    return conexao('motoristas').where({ id }).first();
  },

  /** Detalhe com o número integral: só para o fluxo de edição autorizado. */
  buscarDetalhe(id: number, trx?: Knex.Transaction): Promise<MotoristaComNome | undefined> {
    const conexao = trx || db;
    return conexao('motoristas as m')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .select(colunasDetalhe(conexao))
      .where('m.id', id)
      .first();
  },

  buscarParaAtualizar(id: number, trx: Knex.Transaction): Promise<Pick<Motorista, 'id' | 'tipo_motorista'> | undefined> {
    return trx('motoristas').select('id', 'tipo_motorista').where({ id }).forUpdate().first();
  },

  buscarPorUsuarioId(usuarioId: number, trx?: Knex.Transaction): Promise<MotoristaComNome | undefined> {
    const conexao = trx || db;
    return conexao('motoristas as m')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .select(colunasDetalhe(conexao))
      .where('m.usuario_id', usuarioId)
      .first();
  },

  /** Trava o usuário para serializar cadastros concorrentes da mesma pessoa. */
  travarUsuario(usuarioId: number, trx: Knex.Transaction): Promise<UsuarioParaMotorista | undefined> {
    return trx('usuarios').select('id', 'perfil', 'ativo').where({ id: usuarioId }).forUpdate().first();
  },

  async existeParaUsuario(usuarioId: number, trx: Knex.Transaction): Promise<boolean> {
    return Boolean(await trx('motoristas').where({ usuario_id: usuarioId }).first('id'));
  },

  /** Serializa, até o fim da transação, gravações que usem o mesmo número canônico. */
  async travarNumeroCnh(canonico: string, trx: Knex.Transaction): Promise<void> {
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext('motoristas.cnh:' || ?))", [canonico]);
  },

  async existeCnhCanonica(canonico: string, trx: Knex.Transaction, ignorarId?: number): Promise<boolean> {
    const consulta = trx('motoristas').whereRaw(`${sqlCnhCanonica()} = ?`, [canonico]).first('id');
    if (ignorarId !== undefined) consulta.whereNot({ id: ignorarId });
    return Boolean(await consulta);
  },

  async criar(dados: DadosNovoMotorista, trx: Knex.Transaction): Promise<number> {
    const [linha] = await trx('motoristas').insert({ ...dados, status: 'DISPONIVEL' }).returning<{ id: number }[]>('id');
    return linha.id;
  },

  async atualizarCnh(id: number, alteracoes: AlteracoesCnh, trx: Knex.Transaction): Promise<void> {
    await trx('motoristas').where({ id }).update(alteracoes);
  },

  /** Usuários ativos com perfil de motorista do tipo permitido e ainda sem registro em motoristas. */
  listarUsuariosElegiveis(tipos: TipoMotorista[]): Promise<UsuarioElegivel[]> {
    return db('usuarios as u')
      .leftJoin('motoristas as m', 'm.usuario_id', 'u.id')
      .select('u.id', 'u.nome', 'u.perfil')
      .where('u.ativo', true)
      .whereIn('u.perfil', tipos.map((tipo) => PERFIL_DO_TIPO[tipo]))
      .whereNull('m.id')
      .orderBy('u.nome', 'asc');
  },

  async atualizarStatus(id: number, status: StatusMotorista, trx?: Knex.Transaction): Promise<void> {
    const conexao = trx || db;
    await conexao('motoristas').where({ id }).update({ status });
  },
};
