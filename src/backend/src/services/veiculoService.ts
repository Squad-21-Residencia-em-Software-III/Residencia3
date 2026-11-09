import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { veiculoModel, type Veiculo, type VeiculoSvoDisponivel } from '../models/veiculoModel';
import type { CriarVeiculoInput } from '../validators/veiculoSchemas';

export const veiculoService = {
  async listar(): Promise<Veiculo[]> {
    return veiculoModel.listarVeiculos();
  },

  async listarSvoDisponiveis(): Promise<VeiculoSvoDisponivel[]> {
    return veiculoModel.listarSvoDisponiveis();
  },

  async criar(dados: CriarVeiculoInput, autorId: number): Promise<Veiculo> {
    const veiculoExistente = await veiculoModel.buscarPorPlaca(dados.placa);
    if (veiculoExistente) {
      throw new AppError('Já existe um veículo cadastrado com essa placa', 409);
    }

    return db.transaction(async (trx) => {
      const veiculo = await veiculoModel.cadastrarVeiculo(dados, trx);

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `CRIOU_VEICULO id=${veiculo.id} placa=${veiculo.placa}`,
          modulo: MODULOS_AUDITORIA.VEICULOS ?? 'VEICULOS',
        },
        trx
      );

      return veiculo;
    });
  },
};