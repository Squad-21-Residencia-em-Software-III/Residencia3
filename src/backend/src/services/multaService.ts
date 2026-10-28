import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { motoristaModel } from '../models/motoristaModel';
import { multaModel, type Multa } from '../models/multaModel';
import type { CriarMultaInput } from '../validators/multaSchemas';

async function garantirVeiculoExiste(veiculoId: number): Promise<void> {
  const veiculo = await db('veiculos').where({ id: veiculoId }).first();

  if (!veiculo) {
    throw new AppError('Veículo não encontrado', 404);
  }
}

async function garantirMotoristaExiste(motoristaId: number): Promise<void> {
  const motorista = await motoristaModel.buscarPorId(motoristaId);

  if (!motorista) {
    throw new AppError('Motorista não encontrado', 404);
  }
}

export const multaService = {
  async criar(dados: CriarMultaInput, autorId: number): Promise<Multa> {
    await garantirVeiculoExiste(dados.veiculo_id);

    if (dados.motorista_id !== undefined && dados.motorista_id !== null) {
      await garantirMotoristaExiste(dados.motorista_id);
    }

    return db.transaction(async (trx) => {
      const multa = await multaModel.cadastrar(dados, trx);

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `Multa ${multa.id} cadastrada`,
          modulo: MODULOS_AUDITORIA.MULTAS,
        },
        trx
      );

      return multa;
    });
  },

  async listar(): Promise<Multa[]> {
    return multaModel.listar();
  },
};