import type { Knex } from 'knex';
import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  manutencaoModel,
  type Manutencao,
  type ManutencaoDetalhada,
  type StatusManutencao,
} from '../models/manutencaoModel';
import type {
  CriarManutencaoInput,
  AtualizarManutencaoInput,
} from '../validators/manutencaoSchemas';

async function garantirVeiculoExiste(veiculoId: number) {
  const veiculo = await db('veiculos').where({ id: veiculoId }).first();
  if (!veiculo) {
    throw new AppError('Veículo não encontrado', 404);
  }
  return veiculo;
}

export async function recalcularStatusVeiculo(
  trx: Knex.Transaction,
  veiculoId: number,
  manutencaoIdIgnorada?: number
): Promise<void> {
  const veiculo = await trx('veiculos').where({ id: veiculoId }).first();
  if (!veiculo) {
    return;
  }

  // Veículos inativos não devem ter seu status alterado automaticamente
  if (veiculo.status === 'INATIVO') {
    return;
  }

  // 1. Manutenções ativas (bloqueantes: EM_ANDAMENTO)
  const temManutencaoAtiva = await manutencaoModel.temManutencaoAtiva(
    veiculoId,
    manutencaoIdIgnorada,
    trx
  );

  if (temManutencaoAtiva) {
    if (veiculo.status !== 'MANUTENCAO') {
      await trx('veiculos').where({ id: veiculoId }).update({ status: 'MANUTENCAO' });
    }
    return;
  }

  // 2. Viagens ou ordens em andamento/deslocamento -> EM_USO
  const viagemEmAndamento = await trx('viagens_frota')
    .where({ veiculo_id: veiculoId, status: 'EM_ANDAMENTO' })
    .first();

  const ordemEmAndamento = await trx('ordens_svo')
    .where({ veiculo_id: veiculoId, status: 'EM_DESLOCAMENTO' })
    .first();

  if (viagemEmAndamento || ordemEmAndamento) {
    if (veiculo.status !== 'EM_USO') {
      await trx('veiculos').where({ id: veiculoId }).update({ status: 'EM_USO' });
    }
    return;
  }

  // 3. Agendamentos futuros ou ordens alocadas -> RESERVADO
  const viagemAgendada = await trx('viagens_frota')
    .where({ veiculo_id: veiculoId, status: 'AGENDADA' })
    .first();

  const ordemAlocada = await trx('ordens_svo')
    .where({ veiculo_id: veiculoId, status: 'ALOCADA' })
    .first();

  if (viagemAgendada || ordemAlocada) {
    if (veiculo.status !== 'RESERVADO') {
      await trx('veiculos').where({ id: veiculoId }).update({ status: 'RESERVADO' });
    }
    return;
  }

  // 4. Sem manutenções ativas, viagens ativas ou agendamentos -> DISPONIVEL
  if (veiculo.status !== 'DISPONIVEL') {
    await trx('veiculos').where({ id: veiculoId }).update({ status: 'DISPONIVEL' });
  }
}

export const manutencaoService = {
  async criar(dados: CriarManutencaoInput, autorId: number): Promise<Manutencao> {
    await garantirVeiculoExiste(dados.veiculo_id);

    if (dados.fornecedor_id !== undefined && dados.fornecedor_id !== null) {
      const fornecedor = await db('fornecedores')
        .where({ id: dados.fornecedor_id })
        .first();

      if (!fornecedor) {
        throw new AppError('Fornecedor/Oficina não encontrado', 404);
      }
    }

    return db.transaction(async (trx) => {
      const manutencao = await manutencaoModel.cadastrar(
        {
          veiculo_id: dados.veiculo_id,
          fornecedor_id: dados.fornecedor_id ?? null,
          tipo_manutencao: dados.tipo_manutencao,
          data_manutencao: dados.data_manutencao,
          descricao: dados.descricao,
          custo: dados.custo,
          status: dados.status,
        },
        trx
      );

      await recalcularStatusVeiculo(trx, dados.veiculo_id);

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `CRIOU_MANUTENCAO id=${manutencao.id} veiculo=${dados.veiculo_id} tipo=${dados.tipo_manutencao}`,
          modulo: MODULOS_AUDITORIA.MANUTENCOES,
        },
        trx
      );

      return manutencao;
    });
  },

  async atualizar(
    id: number,
    dados: AtualizarManutencaoInput,
    autorId: number
  ): Promise<Manutencao> {
    const manutencao = await manutencaoModel.buscarPorId(id);
    if (!manutencao) {
      throw new AppError('Manutenção não encontrada', 404);
    }

    if (dados.fornecedor_id !== undefined && dados.fornecedor_id !== null) {
      const fornecedor = await db('fornecedores')
        .where({ id: dados.fornecedor_id })
        .first();
      if (!fornecedor) {
        throw new AppError('Fornecedor/Oficina não encontrado', 404);
      }
    }

    return db.transaction(async (trx) => {
      const atualizada = await manutencaoModel.atualizar(id, dados, trx);
      if (!atualizada) {
        throw new AppError('Erro ao atualizar manutenção', 500);
      }

      await recalcularStatusVeiculo(trx, manutencao.veiculo_id);

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `ATUALIZOU_MANUTENCAO id=${id} veiculo=${manutencao.veiculo_id}`,
          modulo: MODULOS_AUDITORIA.MANUTENCOES,
        },
        trx
      );

      return atualizada;
    });
  },

  async atualizarStatus(
    id: number,
    novoStatus: StatusManutencao,
    autorId: number
  ): Promise<Manutencao> {
    const manutencao = await manutencaoModel.buscarPorId(id);

    if (!manutencao) {
      throw new AppError('Manutenção não encontrada', 404);
    }

    return db.transaction(async (trx) => {
      const atualizada = await manutencaoModel.atualizarStatus(id, novoStatus, trx);

      if (!atualizada) {
        throw new AppError('Erro ao atualizar status da manutenção', 500);
      }

      await recalcularStatusVeiculo(trx, manutencao.veiculo_id);

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `ATUALIZOU_STATUS_MANUTENCAO id=${id} veiculo=${manutencao.veiculo_id} de=${manutencao.status} para=${novoStatus}`,
          modulo: MODULOS_AUDITORIA.MANUTENCOES,
        },
        trx
      );

      return atualizada;
    });
  },

  async excluir(id: number, autorId: number): Promise<void> {
    const manutencao = await manutencaoModel.buscarPorId(id);
    if (!manutencao) {
      throw new AppError('Manutenção não encontrada', 404);
    }

    await db.transaction(async (trx) => {
      await manutencaoModel.excluir(id, trx);
      await recalcularStatusVeiculo(trx, manutencao.veiculo_id);

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `EXCLUIU_MANUTENCAO id=${id} veiculo=${manutencao.veiculo_id}`,
          modulo: MODULOS_AUDITORIA.MANUTENCOES,
        },
        trx
      );
    });
  },

  async listarPorVeiculo(veiculoId: number): Promise<ManutencaoDetalhada[]> {
    await garantirVeiculoExiste(veiculoId);
    return manutencaoModel.listarPorVeiculo(veiculoId);
  },
};
