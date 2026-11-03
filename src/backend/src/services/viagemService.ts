import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { motoristaModel } from '../models/motoristaModel';
import { veiculoModel } from '../models/veiculoModel';
import {
  periodoDaSolicitacao,
  STATUS_MOTORISTA_BLOQUEADO,
  STATUS_VEICULO_BLOQUEADO,
  viagensConflitantes,
} from './disponibilidadeService';

interface CriarViagemInput {
  solicitacao_id: number;
  veiculo_id: number;
  motorista_id: number;
}

export const viagemService = {
  async criar(dados: CriarViagemInput, autorId: number) {
    return db.transaction(async (trx) => {
      // 1. Busca a solicitação para obter o período da viagem
      const solicitacao = await trx('solicitacoes_viagem').where({ id: dados.solicitacao_id }).first();
      if (!solicitacao) {
        throw new AppError('Solicitação de viagem não encontrada', 404);
      }
      const { inicio, fim } = periodoDaSolicitacao(solicitacao);

      // 2. Valida veiculo (bloqueia a linha para evitar agendamentos simultâneos)
      const veiculo = await trx('veiculos').where({ id: dados.veiculo_id }).forUpdate().first();
      if (!veiculo) {
        throw new AppError('Veículo não encontrado', 404);
      }
      if (STATUS_VEICULO_BLOQUEADO.includes(veiculo.status)) {
        throw new AppError('O veículo não está disponível', 400);
      }
      const conflitoVeiculo = await viagensConflitantes(trx, inicio, fim)
        .where('vf.veiculo_id', dados.veiculo_id)
        .first('vf.id');
      if (conflitoVeiculo) {
        throw new AppError('O veículo já possui viagem no período solicitado', 409);
      }

      // 3. Valida motorista (bloqueia a linha para evitar agendamentos simultâneos)
      const motorista = await trx('motoristas').where({ id: dados.motorista_id }).forUpdate().first();
      if (!motorista) {
        throw new AppError('Motorista não encontrado', 404);
      }
      if (STATUS_MOTORISTA_BLOQUEADO.includes(motorista.status)) {
        throw new AppError('O motorista não está disponível', 400);
      }
      const conflitoMotorista = await viagensConflitantes(trx, inicio, fim)
        .where('vf.motorista_id', dados.motorista_id)
        .first('vf.id');
      if (conflitoMotorista) {
        throw new AppError('O motorista já possui viagem no período solicitado', 409);
      }

      // 4. Cria o registro da viagem
      const [viagem] = await trx('viagens_frota')
        .insert({
          solicitacao_id: dados.solicitacao_id,
          veiculo_id: dados.veiculo_id,
          motorista_id: dados.motorista_id,
          status: 'AGENDADA',
        })
        .returning('*');

      // 5. Atualiza status do veiculo e motorista sem sobrescrever EM_USO/EM_VIAGEM
      if (veiculo.status === 'DISPONIVEL') {
        await veiculoModel.atualizarStatus(dados.veiculo_id, 'RESERVADO', trx);
      }
      if (motorista.status === 'DISPONIVEL') {
        await motoristaModel.atualizarStatus(dados.motorista_id, 'DESIGNADO', trx);
      }

      // 6. Registra auditoria
      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `CRIOU_VIAGEM id=${viagem.id} veiculo=${dados.veiculo_id} motorista=${dados.motorista_id}`,
          modulo: MODULOS_AUDITORIA.VEICULOS,
        },
        trx
      );

      return viagem;
    });
  },

  async iniciarViagem(viagemId: number, kmInicial: number, autorId: number) {
    return db.transaction(async (trx) => {
      const viagem = await trx('viagens_frota').where({ id: viagemId }).first();
      if (!viagem) {
        throw new AppError('Viagem não encontrada', 404);
      }
      if (viagem.status !== 'AGENDADA') {
        throw new AppError('Apenas viagens agendadas podem ser iniciadas', 400);
      }

      // Atualiza a viagem
      await trx('viagens_frota').where({ id: viagemId }).update({
        status: 'EM_ANDAMENTO',
        km_inicial: kmInicial,
        data_hora_efetiva_saida: new Date(),
      });

      // Atualiza status do veiculo e motorista
      await veiculoModel.atualizarStatus(viagem.veiculo_id, 'EM_USO', trx);
      await motoristaModel.atualizarStatus(viagem.motorista_id, 'EM_VIAGEM', trx);

      // Auditoria
      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `INICIOU_VIAGEM id=${viagemId} km_inicial=${kmInicial}`,
          modulo: MODULOS_AUDITORIA.VEICULOS,
        },
        trx
      );

      return trx('viagens_frota').where({ id: viagemId }).first();
    });
  },

  async finalizarViagem(viagemId: number, kmFinal: number, autorId: number) {
    return db.transaction(async (trx) => {
      const viagem = await trx('viagens_frota').where({ id: viagemId }).first();
      if (!viagem) {
        throw new AppError('Viagem não encontrada', 404);
      }
      if (viagem.status !== 'EM_ANDAMENTO') {
        throw new AppError('Apenas viagens em andamento podem ser finalizadas', 400);
      }
      if (kmFinal < viagem.km_inicial) {
        throw new AppError('O km final não pode ser menor que o km inicial', 400);
      }

      // Atualiza a viagem
      await trx('viagens_frota').where({ id: viagemId }).update({
        status: 'CONCLUIDA',
        km_final: kmFinal,
        data_hora_efetiva_chegada: new Date(),
      });

      // Atualiza km do veiculo
      await trx('veiculos').where({ id: viagem.veiculo_id }).update({ km_atual: kmFinal });

      // Retorna veiculo e motorista para DISPONIVEL
      await veiculoModel.atualizarStatus(viagem.veiculo_id, 'DISPONIVEL', trx);
      await motoristaModel.atualizarStatus(viagem.motorista_id, 'DISPONIVEL', trx);

      // Auditoria
      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `FINALIZOU_VIAGEM id=${viagemId} km_final=${kmFinal}`,
          modulo: MODULOS_AUDITORIA.VEICULOS,
        },
        trx
      );

      return trx('viagens_frota').where({ id: viagemId }).first();
    });
  },
};