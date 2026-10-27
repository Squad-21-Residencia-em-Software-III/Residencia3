import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { manutencaoModel, type Manutencao } from '../models/manutencaoModel';
import type { CriarManutencaoInput } from '../validators/manutencaoSchemas';

async function garantirVeiculoExiste(veiculoId: number): Promise<void> {
  const veiculo = await db('veiculos').where({ id: veiculoId }).first();
  if (!veiculo) {
    throw new AppError('Veículo não encontrado', 404);
  }
}

export const manutencaoService = {
  async criar(dados: CriarManutencaoInput, autorId: number): Promise<Manutencao> {
    await garantirVeiculoExiste(dados.veiculo_id);

    if (dados.fornecedor_id !== undefined) {
      const fornecedor = await db('fornecedores').where({ id: dados.fornecedor_id }).first();
      if (!fornecedor) {
        throw new AppError('Fornecedor não encontrado', 404);
      }
    }

    return db.transaction(async (trx) => {
      const manutencao = await manutencaoModel.cadastrar(dados, trx);

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `CRIOU_MANUTENCAO id=${manutencao.id} veiculo=${manutencao.veiculo_id} tipo=${manutencao.tipo_manutencao}`,
          modulo: MODULOS_AUDITORIA.MANUTENCOES,
        },
        trx
      );

      return manutencao;
    });
  },

  async listarPorVeiculo(veiculoId: number): Promise<Manutencao[]> {
    await garantirVeiculoExiste(veiculoId);
    return manutencaoModel.listarPorVeiculo(veiculoId);
  },
};
