import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { veiculoModel, type Veiculo, type VeiculoSvoDisponivel } from '../models/veiculoModel';
import type { CriarVeiculoInput, AtualizarVeiculoInput } from '../validators/veiculoSchemas';

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

  async atualizar(id: number, dados: AtualizarVeiculoInput, autorId: number): Promise<Veiculo> {
    const veiculo = await veiculoModel.buscarPorId(id);
    if (!veiculo) {
      throw new AppError('Veículo não encontrado', 404);
    }

    if (dados.placa && dados.placa !== veiculo.placa) {
      const comPlaca = await veiculoModel.buscarPorPlaca(dados.placa);
      if (comPlaca) {
        throw new AppError('Já existe um veículo cadastrado com essa placa', 409);
      }
    }

    return db.transaction(async (trx) => {
      const atualizado = await veiculoModel.atualizarVeiculo(id, dados, trx);
      if (!atualizado) {
        throw new AppError('Erro ao atualizar veículo', 500);
      }

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `ATUALIZOU_VEICULO id=${id} placa=${atualizado.placa}`,
          modulo: MODULOS_AUDITORIA.VEICULOS ?? 'VEICULOS',
        },
        trx
      );

      return atualizado;
    });
  },
};
