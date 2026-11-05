import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { dashboardController } from '../controllers/dashboardController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const dashboardRoutes = Router();

// RF17: o dashboard é do Gestor de Frota e do Administrador
dashboardRoutes.use(autenticar, autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA));

dashboardRoutes.get('/', dashboardController.consultar);
