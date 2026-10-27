import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  manutencaoModel,
  type Manutencao,
  type ManutencaoDetalhada,
} from '../models/manutencaoModel';
import type { CriarManutencaoInput } from '../validators/manutencaoSchemas';

export const manutencaoService = {
  async criar(
    dados: CriarManutencaoInput,
    autorId: number
  ): Promise<Manutencao> {
    const veiculo = await db('veiculos')
      .where({ id: dados.veiculo_id })
      .first();

    if (!veiculo) {
      throw new AppError('Veículo não encontrado', 404);
    }

    if (dados.fornecedor_id) {
      const fornecedor = await db('fornecedores')
        .where({ id: dados.fornecedor_id })
        .first();

      if (!fornecedor) {
        throw new AppError('Fornecedor/Oficina não encontrado', 404);
      }
    }

    return db.transaction(async (trx) => {
      // 1. Cadastra a manutenção no banco
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

      // 2. Se o status for EM_ANDAMENTO, atualiza o status do veículo para MANUTENCAO.
      // Se for CONCLUIDA e o veículo estiver em MANUTENCAO, verifica se ainda há outras pendências.
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

      // 3. Registra auditoria
      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `CRIOU_MANUTENCAO id=${manutencao.id} veiculo=${dados.veiculo_id} tipo=${dados.tipo_manutencao} custo=${dados.custo} status=${dados.status}`,
          modulo: MODULOS_AUDITORIA.VEICULOS,
        },
        trx
      );

      return manutencao;
    });
  },

  async atualizarStatus(
    id: number,
    novoStatus: 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA',
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

      // Atualiza o status do veículo conforme a transição
      if (novoStatus === 'EM_ANDAMENTO') {
        await trx('veiculos')
          .where({ id: manutencao.veiculo_id })
          .update({ status: 'MANUTENCAO' });
      } else if (novoStatus === 'CONCLUIDA' || novoStatus === 'AGENDADA') {
        // Verifica se ainda existe alguma outra manutenção em andamento para este veículo
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

      // Auditoria
      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `ATUALIZOU_STATUS_MANUTENCAO id=${id} veiculo=${manutencao.veiculo_id} de=${manutencao.status} para=${novoStatus}`,
          modulo: MODULOS_AUDITORIA.VEICULOS,
        },
        trx
      );

      return atualizada;
    });
  },

  async listarPorVeiculo(veiculoId: number): Promise<ManutencaoDetalhada[]> {
    const veiculo = await db('veiculos')
      .where({ id: veiculoId })
      .first();

    if (!veiculo) {
      throw new AppError('Veículo não encontrado', 404);
    }

    return manutencaoModel.listarPorVeiculo(veiculoId);
  },
};

