import type { Knex } from 'knex';
import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  veiculoModel,
  type Veiculo,
  type VeiculoSvoDisponivel,
  type OcupacaoVeiculoSvo,
} from '../models/veiculoModel';
import type { CriarVeiculoInput, AtualizarVeiculoInput } from '../validators/veiculoSchemas';

// Ordens SVO que ocupam vagas no veículo
const ORDENS_SVO_ATIVAS = ['ALOCADA', 'EM_DESLOCAMENTO'];

// Soma das vagas ocupadas pelas ordens SVO ativas do veículo
async function ocupacaoSvo(trx: Knex.Transaction, veiculoId: number): Promise<number> {
  const [linha] = await trx('ordens_svo')
    .where({ veiculo_id: veiculoId })
    .whereIn('status', ORDENS_SVO_ATIVAS)
    .sum<{ ocupacao: string | number | null }[]>({ ocupacao: 'capacidade_utilizada' });

  return Number(linha?.ocupacao ?? 0);
}

export const veiculoService = {
  async listar(): Promise<Veiculo[]> {
    return veiculoModel.listarVeiculos();
  },

  async listarSvoDisponiveis(): Promise<VeiculoSvoDisponivel[]> {
    return veiculoModel.listarSvoDisponiveis();
  },

  async listarOcupacaoSvo(): Promise<OcupacaoVeiculoSvo[]> {
    return veiculoModel.listarOcupacaoSvo();
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

    const tipoFrotaFinal = dados.tipo_frota ?? veiculo.tipo_frota;
    const capacidadeFinal = dados.capacidade_maxima ?? veiculo.capacidade_maxima;

    if (tipoFrotaFinal === 'SVO' && capacidadeFinal > 4) {
      throw new AppError('Veículos da frota SVO podem ter capacidade máxima de até 4', 400);
    }

    if (dados.placa && dados.placa !== veiculo.placa) {
      const comPlaca = await veiculoModel.buscarPorPlaca(dados.placa);
      if (comPlaca) {
        throw new AppError('Já existe um veículo cadastrado com essa placa', 409);
      }
    }

    return db.transaction(async (trx) => {
      const mudaCapacidade =
        dados.capacidade_maxima !== undefined && dados.capacidade_maxima !== veiculo.capacidade_maxima;
      const mudaFrota = dados.tipo_frota !== undefined && dados.tipo_frota !== veiculo.tipo_frota;

      if (mudaCapacidade || mudaFrota) {
        // Trava o veículo como na alocação SVO, para que uma ordem nova não entre no meio da edição
        await trx('veiculos').where({ id }).forUpdate().first('id');
        const ocupacao = await ocupacaoSvo(trx, id);

        if (mudaFrota && veiculo.tipo_frota === 'SVO' && ocupacao > 0) {
          throw new AppError('O veículo possui ordens SVO ativas e não pode sair da frota SVO', 409);
        }
        if (mudaCapacidade && capacidadeFinal < ocupacao) {
          throw new AppError(
            `A capacidade não pode ser menor que a ocupação atual do veículo (${ocupacao})`,
            409
          );
        }
      }

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
