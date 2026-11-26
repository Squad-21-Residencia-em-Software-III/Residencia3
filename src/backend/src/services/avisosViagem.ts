import type { Knex } from 'knex';
import { PERFIS } from '../constants/perfis';
import { AppError } from '../errors/AppError';

export interface VinculosViagemAdministrativa {
  motoristaUsuarioId: number;
  solicitanteUsuarioId: number;
  unidadeId: number | null;
}

export async function buscarVinculosViagemAdministrativa(
  trx: Knex.Transaction,
  viagemId: number
): Promise<VinculosViagemAdministrativa> {
  const viagem = await trx('viagens_frota as vf')
    .join('motoristas as m', 'm.id', 'vf.motorista_id')
    .join('solicitacoes_viagem as sv', 'sv.id', 'vf.solicitacao_id')
    .where('vf.id', viagemId)
    .select(
      'm.usuario_id as motoristaUsuarioId',
      'sv.solicitante_id as solicitanteUsuarioId',
      'sv.unidade_id as unidadeId'
    )
    .first<VinculosViagemAdministrativa>();

  if (!viagem) {
    throw new AppError('Viagem administrativa nao encontrada', 404);
  }

  return viagem;
}


export interface DestinatariosViagemAdministrativa {
  motorista: number[];
  solicitante: number[];
  gestores: number[];
}

export async function buscarDestinatariosViagemAdministrativa(
  trx: Knex.Transaction,
  viagemId: number
): Promise<DestinatariosViagemAdministrativa> {
  const vinculos = await buscarVinculosViagemAdministrativa(trx, viagemId);

  const usuarios = await trx('usuarios')
    .whereIn('id', [
      vinculos.motoristaUsuarioId,
      vinculos.solicitanteUsuarioId,
    ])
    .where({ ativo: true })
    .select('id', 'perfil');

  const motorista = usuarios
    .filter((usuario) =>
      usuario.id === vinculos.motoristaUsuarioId &&
      usuario.perfil === PERFIS.MOTORISTA_FROTA
    )
    .map((usuario) => usuario.id as number);

  const solicitante = usuarios
    .filter((usuario) =>
      usuario.id === vinculos.solicitanteUsuarioId &&
      [
        PERFIS.SOLICITANTE,
        PERFIS.GESTOR_FROTA,
        PERFIS.GESTOR_SVO,
        PERFIS.ADMINISTRADOR,
      ].includes(usuario.perfil)
    )
    .map((usuario) => usuario.id as number);

  const gestores: number[] = await trx('usuarios')
    .where({
      perfil: PERFIS.GESTOR_FROTA,
      ativo: true,
    })
    .pluck('id');

  return { motorista, solicitante, gestores };
}

