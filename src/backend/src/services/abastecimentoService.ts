
import { db } from '../config/database';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  abastecimentoModel,
  type AbastecimentoComPreco,
} from '../models/abastecimentoModel';
import type { CriarAbastecimentoInput } from '../validators/abastecimentoSchemas';
import { PERFIS, type Perfil } from '../constants/perfis';
import type { Usuario } from '../models/usuarioModel';

export type IdentificadorAutor = Usuario | { id: number; perfil?: Perfil } | number;

async function resolverAutor(autor: IdentificadorAutor): Promise<{ id: number; perfil?: Perfil }> {
  if (typeof autor === 'number') {
    const usuario = await db('usuarios').where({ id: autor }).first();
    return { id: autor, perfil: usuario?.perfil };
  }
  return { id: autor.id, perfil: autor.perfil };
}

export const abastecimentoService = {
  async criar(
    dados: CriarAbastecimentoInput,
    autor: IdentificadorAutor
  ): Promise<AbastecimentoComPreco> {
    const { id: autorId, perfil: autorPerfil } = await resolverAutor(autor);

    const veiculo = await db('veiculos')
      .where({ id: dados.veiculo_id })
      .first();

    if (!veiculo) {
      throw new AppError('Veículo não encontrado', 404);
    }

    if (veiculo.status === 'INATIVO') {
      throw new AppError('Não é permitido abastecer veículo inativo', 400);
    }

    const ehPerfilMotorista =
      autorPerfil === PERFIS.MOTORISTA_FROTA ||
      autorPerfil === PERFIS.MOTORISTA_SVO;

    let motoristaIdFinal: number;

    if (ehPerfilMotorista) {
      // Quando for motorista, recupera o motorista do token e ignora o motorista_id do body
      const motoristaDoUsuario = await db('motoristas')
        .where({ usuario_id: autorId })
        .first();

      if (!motoristaDoUsuario) {
        throw new AppError('Usuário não possui vínculo ativo como motorista', 403);
      }

      if (motoristaDoUsuario.status === 'INATIVO') {
        throw new AppError('Motorista inativo não tem permissão para registrar abastecimento', 403);
      }

      // Valida vínculo de frota
      if (motoristaDoUsuario.tipo_motorista === 'FROTA' && veiculo.tipo_frota !== 'ADMINISTRATIVA') {
        throw new AppError(
          'Motorista da frota administrativa não tem permissão para abastecer veículo SVO',
          403
        );
      }
      if (motoristaDoUsuario.tipo_motorista === 'SVO' && veiculo.tipo_frota !== 'SVO') {
        throw new AppError(
          'Motorista SVO não tem permissão para abastecer veículo da frota administrativa',
          403
        );
      }

      motoristaIdFinal = motoristaDoUsuario.id;
    } else {
      // Administrador ou Gestor de Frota
      const motorista = await db('motoristas')
        .where({ id: dados.motorista_id })
        .first();

      if (!motorista) {
        throw new AppError('Motorista não encontrado', 404);
      }

      if (motorista.status === 'INATIVO') {
        throw new AppError('Motorista informado está inativo', 400);
      }

      if (motorista.tipo_motorista === 'FROTA' && veiculo.tipo_frota !== 'ADMINISTRATIVA') {
        throw new AppError(
          'Motorista da frota administrativa não pode ser vinculado a veículo SVO',
          400
        );
      }
      if (motorista.tipo_motorista === 'SVO' && veiculo.tipo_frota !== 'SVO') {
        throw new AppError(
          'Motorista SVO não pode ser vinculado a veículo da frota administrativa',
          400
        );
      }

      motoristaIdFinal = motorista.id;
    }

    if (!dados.posto_combustivel?.trim()) {
      throw new AppError('Informe o nome do posto utilizado', 400);
    }

    const dadosAbastecimento: CriarAbastecimentoInput = {
      ...dados,
      motorista_id: motoristaIdFinal,
    };

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
        dadosAbastecimento,
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
    veiculoId: number,
    autor?: IdentificadorAutor
  ): Promise<AbastecimentoComPreco[]> {
    const veiculo = await db('veiculos')
      .where({ id: veiculoId })
      .first();

    if (!veiculo) {
      throw new AppError('Veículo não encontrado', 404);
    }

    if (autor !== undefined) {
      const { id: autorId, perfil: autorPerfil } = await resolverAutor(autor);
      const ehPerfilMotorista =
        autorPerfil === PERFIS.MOTORISTA_FROTA ||
        autorPerfil === PERFIS.MOTORISTA_SVO;

      if (ehPerfilMotorista) {
        const motoristaDoUsuario = await db('motoristas')
          .where({ usuario_id: autorId })
          .first();

        if (!motoristaDoUsuario) {
          throw new AppError('Usuário não possui vínculo ativo como motorista', 403);
        }

        if (motoristaDoUsuario.tipo_motorista === 'FROTA' && veiculo.tipo_frota !== 'ADMINISTRATIVA') {
          throw new AppError('Acesso não autorizado aos registros deste veículo', 403);
        }
        if (motoristaDoUsuario.tipo_motorista === 'SVO' && veiculo.tipo_frota !== 'SVO') {
          throw new AppError('Acesso não autorizado aos registros deste veículo', 403);
        }
      }
    }

    return abastecimentoModel.listarPorVeiculo(veiculoId);
  },
};
