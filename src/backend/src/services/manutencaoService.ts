import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  manutencaoModel,
  type Manutencao,
  type ManutencaoDetalhada,
  type StatusManutencao,
} from '../models/manutencaoModel';
import type { CriarManutencaoInput } from '../validators/manutencaoSchemas';

async function garantirVeiculoExiste(veiculoId: number) {
  const veiculo = await db('veiculos').where({ id: veiculoId }).first();
  if (!veiculo) {
    throw new AppError('Veículo não encontrado', 404);
  }
  return veiculo;
}

export const manutencaoService = {
  async criar(dados: CriarManutencaoInput, autorId: number): Promise<Manutencao> {
    const veiculo = await garantirVeiculoExiste(dados.veiculo_id);

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

      if (dados.status === 'EM_ANDAMENTO') {
        await trx('veiculos')
          .where({ id: dados.veiculo_id })
          .update({ status: 'MANUTENCAO' });
      } else if (dados.status === 'CONCLUIDA' && veiculo.status === 'MANUTENCAO') {
        const temOutraEmAndamento = await manutencaoModel.temManutencaoEmAndamento(
          dados.veiculo_id,
          undefined,
          trx
        );
        if (!temOutraEmAndamento) {
          await trx('veiculos')
            .where({ id: dados.veiculo_id })
            .update({ status: 'DISPONIVEL' });
        }
      }

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

      if (novoStatus === 'EM_ANDAMENTO') {
        await trx('veiculos')
          .where({ id: manutencao.veiculo_id })
          .update({ status: 'MANUTENCAO' });
      } else if (
        novoStatus === 'CONCLUIDA' ||
        novoStatus === 'AGENDADA' ||
        novoStatus === 'CANCELADA'
      ) {
        const temOutraEmAndamento = await manutencaoModel.temManutencaoEmAndamento(
          manutencao.veiculo_id,
          id,
          trx
        );

        if (!temOutraEmAndamento) {
          await trx('veiculos')
            .where({ id: manutencao.veiculo_id })
            .update({ status: 'DISPONIVEL' });
        }
      }

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

  async listarPorVeiculo(veiculoId: number): Promise<ManutencaoDetalhada[]> {
    await garantirVeiculoExiste(veiculoId);
    return manutencaoModel.listarPorVeiculo(veiculoId);
  },
};