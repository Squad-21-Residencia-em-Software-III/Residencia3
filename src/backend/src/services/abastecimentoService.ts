
import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  abastecimentoModel,
  type Abastecimento,
} from '../models/abastecimentoModel';
import type { CriarAbastecimentoInput } from '../validators/abastecimentoSchemas';

export const abastecimentoService = {
  async criar(
    dados: CriarAbastecimentoInput,
    autorId: number
  ): Promise<Abastecimento> {
    const veiculo = await db('veiculos')
      .where({ id: dados.veiculo_id })
      .first();

    if (!veiculo) {
      throw new AppError('Veículo não encontrado', 404);
    }

    const motorista = await db('motoristas')
      .where({ id: dados.motorista_id })
      .first();

    if (!motorista) {
      throw new AppError('Motorista não encontrado', 404);
    }
    
   if (!dados.posto_combustivel?.trim()) {
  throw new AppError(
    'Informe o nome do posto utilizado',
    400
  );
}

    return db.transaction(async (trx) => {
      const ultimoAbastecimento = await trx('abastecimentos')
        .where({ veiculo_id: dados.veiculo_id })
        .orderBy('quilometragem', 'desc')
        .first();


      if (
        ultimoAbastecimento &&
        dados.quilometragem < Number(ultimoAbastecimento.quilometragem)
      ) {
        throw new AppError(
          'A quilometragem não pode ser menor que a do último abastecimento do veículo',
          400
        );
      }

      // Cadastra o abastecimento
      const abastecimento = await abastecimentoModel.cadastrar(
        dados,
        trx
      );

      // Registra a ação na auditoria
      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `CRIOU_ABASTECIMENTO id=${abastecimento.id} veiculo=${dados.veiculo_id}`,
          modulo: MODULOS_AUDITORIA.VEICULOS ?? 'VEICULOS',
        },
        trx
      );

      return abastecimento;
    });
  },

  async listarPorVeiculo(
    veiculoId: number
  ): Promise<Abastecimento[]> {
    const veiculo = await db('veiculos')
      .where({ id: veiculoId })
      .first();

    if (!veiculo) {
      throw new AppError('Veículo não encontrado', 404);
    }

    return abastecimentoModel.listarPorVeiculo(veiculoId);
  },
};
