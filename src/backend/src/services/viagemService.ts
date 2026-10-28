import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { motoristaModel } from '../models/motoristaModel';
import { veiculoModel } from '../models/veiculoModel';

interface CriarViagemInput {
  solicitacao_id: number;
  veiculo_id: number;
  motorista_id: number;
}

export const viagemService = {
  async criar(dados: CriarViagemInput, autorId: number) {
    return db.transaction(async (trx) => {
      // 1. Valida veiculo
      const veiculo = await veiculoModel.buscarPorId(dados.veiculo_id, trx);
      if (!veiculo) {
        throw new AppError('Veículo não encontrado', 404);
      }
      if (veiculo.status !== 'DISPONIVEL') {
        throw new AppError('O veículo não está disponível', 400);
      }

      // 2. Valida motorista
      const motorista = await motoristaModel.buscarPorId(dados.motorista_id, trx);
      if (!motorista) {
        throw new AppError('Motorista não encontrado', 404);
      }
      if (motorista.status !== 'DISPONIVEL') {
        throw new AppError('O motorista não está disponível', 400);
      }

      // 3. Cria o registro da viagem
      const [viagem] = await trx('viagens_frota')
        .insert({
          solicitacao_id: dados.solicitacao_id,
          veiculo_id: dados.veiculo_id,
          motorista_id: dados.motorista_id,
          status: 'AGENDADA',
        })
        .returning('*');

      // 4. Atualiza status do veiculo e motorista
      await veiculoModel.atualizarStatus(dados.veiculo_id, 'RESERVADO', trx);
      await motoristaModel.atualizarStatus(dados.motorista_id, 'DESIGNADO', trx);

      // 5. Registra auditoria
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