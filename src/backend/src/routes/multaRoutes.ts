import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { multaController } from '../controllers/multaController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const multaRoutes = Router();

multaRoutes.use(autenticar);
multaRoutes.use(autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA));

multaRoutes.get('/', multaController.listar);
multaRoutes.post('/', multaController.criar);