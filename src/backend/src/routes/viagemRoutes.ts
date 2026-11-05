import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { viagemController } from '../controllers/viagemController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const viagemRoutes = Router();

// O tipo de viagem permitido para cada gestor é validado no viagemService
viagemRoutes.use(autenticar, autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO));

viagemRoutes.get('/', viagemController.listar);

viagemRoutes.post('/', viagemController.criar);

viagemRoutes.patch('/:id/iniciar', viagemController.iniciar);

viagemRoutes.patch('/:id/finalizar', viagemController.finalizar);

viagemRoutes.patch('/:id/cancelar', viagemController.cancelar);
