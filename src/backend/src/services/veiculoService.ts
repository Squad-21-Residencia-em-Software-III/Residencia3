import type { Knex } from 'knex';
import { db } from '../config/database';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  veiculoModel,
  type Veiculo,
  type VeiculoSvoDisponivel,
  type OcupacaoVeiculoSvo,
  type VeiculoConsultaBasica,
} from '../models/veiculoModel';
import type { CriarVeiculoInput, AtualizarVeiculoInput } from '../validators/veiculoSchemas';

// Ordens SVO que ocupam vagas no veículo
const ORDENS_SVO_ATIVAS = ['ALOCADA', 'EM_DESLOCAMENTO'];

// Maior compromisso simultâneo. Ordens temporais consecutivas não somam vagas entre si.
async function ocupacaoSvo(trx: Knex.Transaction, veiculoId: number): Promise<number> {
  const ordens: { status: string; inicio_previsto: Date | null; fim_previsto: Date | null; capacidade_utilizada: number }[] =
    await trx('ordens_svo')
    .where({ veiculo_id: veiculoId })
    .whereIn('status', ORDENS_SVO_ATIVAS)
    .select('status', 'inicio_previsto', 'fim_previsto', 'capacidade_utilizada');
  let ocupacaoAtual = 0;
  const eventos: { instante: number; variacao: number }[] = [];
  for (const ordem of ordens) {
    const inicio = ordem.inicio_previsto && new Date(ordem.inicio_previsto).getTime();
    const fim = ordem.fim_previsto && new Date(ordem.fim_previsto).getTime();
    if (ordem.status === 'EM_DESLOCAMENTO' || inicio == null || fim == null || !Number.isFinite(inicio) || !Number.isFinite(fim)) {
      ocupacaoAtual += Number(ordem.capacidade_utilizada);
    } else {
      eventos.push({ instante: inicio, variacao: Number(ordem.capacidade_utilizada) });
      eventos.push({ instante: fim, variacao: -Number(ordem.capacidade_utilizada) });
    }
  }
  eventos.sort((a, b) => a.instante - b.instante || a.variacao - b.variacao);
  let acumulado = 0;
  let maximo = ocupacaoAtual;
  for (const evento of eventos) {
    acumulado += evento.variacao;
    maximo = Math.max(maximo, acumulado);
  }
  return maximo;
}

export const veiculoService = {
  // Motoristas só enxergam os veículos vinculados a eles; os demais perfis, toda a frota
  async listar(autor: { id: number; perfil: Perfil }): Promise<Array<Veiculo | VeiculoConsultaBasica>> {
    if (autor.perfil === PERFIS.MOTORISTA_FROTA || autor.perfil === PERFIS.MOTORISTA_SVO) {
      return veiculoModel.listarVeiculos(await veiculoModel.idsVinculadosAoUsuarioMotorista(autor.id));
    }
    if (autor.perfil === PERFIS.GESTOR_SVO) return veiculoModel.listarParaGestorSvo();
    if (autor.perfil === PERFIS.GESTOR_FROTA) return veiculoModel.listarFrotaAdministrativa();
    return veiculoModel.listarVeiculos();
  },

  async listarSvoDisponiveis(): Promise<VeiculoSvoDisponivel[]> {
    return veiculoModel.listarSvoDisponiveis();
  },

  async listarOcupacaoSvo(): Promise<OcupacaoVeiculoSvo[]> {
    return veiculoModel.listarOcupacaoSvo();
  },

  async criar(dados: CriarVeiculoInput, autorId: number, perfilAutor: Perfil): Promise<Veiculo> {
    if (perfilAutor !== PERFIS.ADMINISTRADOR &&
      !((perfilAutor === PERFIS.GESTOR_SVO && dados.tipo_frota === 'SVO') ||
        (perfilAutor === PERFIS.GESTOR_FROTA && dados.tipo_frota === 'ADMINISTRATIVA'))) {
      throw new AppError('Você não tem permissão para cadastrar veículo nessa frota', 403);
    }
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

  async atualizar(id: number, dados: AtualizarVeiculoInput, autorId: number, perfilAutor: Perfil): Promise<Veiculo> {
    return db.transaction(async (trx) => {
      // Lê o veículo já bloqueado: todas as validações usam o estado atual do banco
      const veiculo = await veiculoModel.buscarParaAtualizar(id, trx);
      if (!veiculo) {
        throw new AppError('Veículo não encontrado', 404);
      }

      const tipoFrotaFinal = dados.tipo_frota ?? veiculo.tipo_frota;
      const capacidadeFinal = dados.capacidade_maxima ?? veiculo.capacidade_maxima;

      if (perfilAutor !== PERFIS.ADMINISTRADOR &&
        !((perfilAutor === PERFIS.GESTOR_SVO && veiculo.tipo_frota === 'SVO' && tipoFrotaFinal === 'SVO') ||
          (perfilAutor === PERFIS.GESTOR_FROTA && veiculo.tipo_frota === 'ADMINISTRATIVA' && tipoFrotaFinal === 'ADMINISTRATIVA'))) {
        throw new AppError('Você não tem permissão para alterar veículo nessa frota', 403);
      }

      if (veiculo.tipo_frota !== 'SVO' && tipoFrotaFinal === 'SVO') {
        const cabineFinal = dados.lotacao_cabine ?? veiculo.lotacao_cabine;
        if (!Number.isInteger(cabineFinal) || cabineFinal == null || cabineFinal < 1) {
          throw new AppError('Informe a lotação da cabine ao converter o veículo para SVO', 400);
        }
      }

      if (tipoFrotaFinal === 'SVO' && capacidadeFinal > 4) {
        throw new AppError('Veículos da frota SVO podem ter capacidade máxima de até 4', 400);
      }

      if (dados.placa && dados.placa !== veiculo.placa) {
        const comPlaca = await veiculoModel.buscarPorPlaca(dados.placa, trx);
        if (comPlaca) {
          throw new AppError('Já existe um veículo cadastrado com essa placa', 409);
        }
      }

      const mudaCapacidade = capacidadeFinal !== veiculo.capacidade_maxima;
      const mudaFrota = tipoFrotaFinal !== veiculo.tipo_frota;

      if (mudaCapacidade || mudaFrota) {
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
