import type { Knex } from 'knex';
import { db } from '../config/database';

import type { StatusSolicitacaoViagem } from '../constants/solicitacoesViagem';

export type { StatusSolicitacaoViagem };

export interface NovaSolicitacaoViagem {
  solicitante_id: number;
  unidade_id: number;
  origem: string;
  destino: string;
  finalidade: string;
  data_saida_desejada: string;
  data_chegada_desejada?: string | null;
}

export interface SolicitacaoViagem extends Omit<NovaSolicitacaoViagem, 'unidade_id'> {
  id: number;
  // Nula nas solicitações criadas antes da escolha de unidade
  unidade_id: number | null;
  status: StatusSolicitacaoViagem;
  motivo_recusa?: string | null;
}

export interface SolicitacaoViagemDetalhada extends SolicitacaoViagem {
  unidade_nome: string | null;
  solicitante_nome: string;
}

// Solicitação vista pelo próprio solicitante, com o agendamento vigente (se houver)
export interface SolicitacaoViagemDoSolicitante extends SolicitacaoViagem {
  unidade_nome: string | null;
  viagem_id: number | null;
  viagem_status: string | null;
  veiculo_placa: string | null;
  veiculo_modelo: string | null;
  motorista_nome: string | null;
}

export interface FiltrosSolicitacoesViagem {
  pagina: number;
  limite: number;
  status?: StatusSolicitacaoViagem;
  // undefined: todas as unidades, inclusive as solicitações sem unidade
  unidadeIds?: number[];
}

export const solicitacaoViagemModel = {
  async listar(
    filtros: FiltrosSolicitacoesViagem
  ): Promise<{ dados: SolicitacaoViagemDetalhada[]; total: number }> {
    const consulta = db('solicitacoes_viagem as sv').modify((q) => {
      if (filtros.status) q.where('sv.status', filtros.status);
      if (filtros.unidadeIds) q.whereIn('sv.unidade_id', filtros.unidadeIds);
    });

    const [dados, contagem] = await Promise.all([
      consulta
        .clone()
        .leftJoin('unidades as un', 'un.id', 'sv.unidade_id')
        .join('usuarios as u', 'u.id', 'sv.solicitante_id')
        .select('sv.*', 'un.nome as unidade_nome', 'u.nome as solicitante_nome')
        .orderBy([{ column: 'sv.data_saida_desejada' }, { column: 'sv.id' }])
        .limit(filtros.limite)
        .offset((filtros.pagina - 1) * filtros.limite),
      consulta.clone().count<{ total: string }[]>({ total: '*' }),
    ]);

    return { dados, total: Number(contagem[0]?.total ?? 0) };
  },

  // Solicitações de um solicitante, das mais recentes para as mais antigas
  async listarDoSolicitante(
    solicitanteId: number,
    filtros: Omit<FiltrosSolicitacoesViagem, 'unidadeIds'>
  ): Promise<{ dados: SolicitacaoViagemDoSolicitante[]; total: number }> {
    const consulta = db('solicitacoes_viagem as sv')
      .where('sv.solicitante_id', solicitanteId)
      .modify((q) => {
        if (filtros.status) q.where('sv.status', filtros.status);
      });

    const [dados, contagem] = await Promise.all([
      consulta
        .clone()
        .leftJoin('unidades as un', 'un.id', 'sv.unidade_id')
        // Viagem mais recente não cancelada: mostra o veículo e o motorista do agendamento
        .joinRaw(
          `LEFT JOIN LATERAL (
            SELECT vf.id, vf.status, v.placa, v.modelo, um.nome AS motorista_nome
            FROM viagens_frota vf
            LEFT JOIN veiculos v ON v.id = vf.veiculo_id
            LEFT JOIN motoristas m ON m.id = vf.motorista_id
            LEFT JOIN usuarios um ON um.id = m.usuario_id
            WHERE vf.solicitacao_id = sv.id AND vf.status <> 'CANCELADA'
            ORDER BY vf.id DESC
            LIMIT 1
          ) AS viagem ON TRUE`
        )
        .select(
          'sv.*',
          'un.nome as unidade_nome',
          'viagem.id as viagem_id',
          'viagem.status as viagem_status',
          'viagem.placa as veiculo_placa',
          'viagem.modelo as veiculo_modelo',
          'viagem.motorista_nome as motorista_nome'
        )
        .orderBy([
          { column: 'sv.data_saida_desejada', order: 'desc' },
          { column: 'sv.id', order: 'desc' },
        ])
        .limit(filtros.limite)
        .offset((filtros.pagina - 1) * filtros.limite),
      consulta.clone().count<{ total: string }[]>({ total: '*' }),
    ]);

    return { dados, total: Number(contagem[0]?.total ?? 0) };
  },

  async cadastrar(
    dados: NovaSolicitacaoViagem,
    trx?: Knex.Transaction
  ): Promise<SolicitacaoViagem> {
    const conexao = trx || db;

    const [solicitacao] = await conexao('solicitacoes_viagem')
      .insert(dados)
      .returning('*');

    return solicitacao;
  },

  // Busca e bloqueia a linha para evitar análises simultâneas
  async buscarParaAtualizar(
    id: number,
    trx: Knex.Transaction
  ): Promise<SolicitacaoViagem | undefined> {
    return trx('solicitacoes_viagem')
      .where({ id })
      .forUpdate()
      .first();
  },

  async atualizarStatus(
    id: number,
    status: StatusSolicitacaoViagem,
    trx?: Knex.Transaction,
    motivoRecusa?: string | null
  ): Promise<SolicitacaoViagem> {
    const conexao = trx || db;
    const dadosAtualizacao: { status: StatusSolicitacaoViagem; motivo_recusa?: string | null } = {
      status,
    };

    if (motivoRecusa !== undefined) {
      dadosAtualizacao.motivo_recusa = motivoRecusa;
    }

    const [solicitacao] = await conexao('solicitacoes_viagem')
      .where({ id })
      .update(dadosAtualizacao)
      .returning('*');

    return solicitacao;
  },
};