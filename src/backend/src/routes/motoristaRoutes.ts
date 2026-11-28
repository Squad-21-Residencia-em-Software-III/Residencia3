import { Router, type NextFunction, type Request, type Response } from 'express';
import { configMotoristas } from '../config/motoristas';
import { PERFIS } from '../constants/perfis';
import { motoristaController } from '../controllers/motoristaController';
import { AppError } from '../errors/AppError';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';

export const motoristaRoutes = Router();

const gestores = autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO);

// SCRUM-308: a escrita só existe depois da confirmação institucional (MOTORISTAS_ESCRITA_ATIVA).
// Fica depois da autorização para que perfis sem permissão recebam 403 com a flag em qualquer estado.
function exigirEscritaMotoristas(_req: Request, _res: Response, next: NextFunction): void {
  if (!configMotoristas.escritaAtiva) throw new AppError('Recurso não encontrado', 404);
  next();
}

motoristaRoutes.use(autenticar);

motoristaRoutes.get('/me', motoristaController.me);

motoristaRoutes.get('/', gestores, exigirAssociacaoSvo, motoristaController.listar);

motoristaRoutes.get(
  '/usuarios-elegiveis',
  gestores,
  exigirAssociacaoSvo,
  exigirEscritaMotoristas,
  motoristaController.listarUsuariosElegiveis
);
motoristaRoutes.get('/:id', gestores, exigirAssociacaoSvo, exigirEscritaMotoristas, motoristaController.buscar);
motoristaRoutes.post('/', gestores, exigirAssociacaoSvo, exigirEscritaMotoristas, motoristaController.criar);
motoristaRoutes.patch('/:id', gestores, exigirAssociacaoSvo, exigirEscritaMotoristas, motoristaController.atualizar);
