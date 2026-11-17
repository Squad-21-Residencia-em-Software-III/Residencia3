import type { NextFunction, Request, Response } from 'express';
import { db } from '../config/database';
import { PERFIS } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from './autenticar';

type Origem = 'veiculo-param' | 'veiculo-body' | 'multa' | 'manutencao';

/** Impede o gestor de frota de consultar ou manipular dados vinculados a veículo SVO. */
export function restringirFrotaAdministrativa(origem: Origem) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (usuarioAutenticado(req).perfil !== PERFIS.GESTOR_FROTA) return next();
    const ids: number[] = [];
    if (origem === 'veiculo-param') ids.push(Number(req.params.veiculoId));
    if (origem === 'veiculo-body' && req.body?.veiculo_id != null) ids.push(Number(req.body.veiculo_id));
    if (origem === 'multa' || origem === 'manutencao') {
      const id = Number(req.params.id);
      if (Number.isInteger(id) && id > 0) {
        const registro = await db(origem === 'multa' ? 'multas' : 'manutencoes').where({ id }).first('veiculo_id');
        if (registro) ids.push(Number(registro.veiculo_id));
      }
      if (req.body?.veiculo_id != null) ids.push(Number(req.body.veiculo_id));
    }
    for (const id of ids) {
      if (!Number.isInteger(id) || id <= 0) continue;
      const veiculo = await db('veiculos').where({ id }).first('tipo_frota');
      if (!veiculo) throw new AppError('Veículo não encontrado', 404);
      if (veiculo.tipo_frota !== 'ADMINISTRATIVA') throw new AppError('Acesso não autorizado a veículo SVO', 403);
    }
    next();
  };
}
