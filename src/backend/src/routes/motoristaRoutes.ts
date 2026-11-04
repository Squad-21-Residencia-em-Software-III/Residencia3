import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { motoristaController } from '../controllers/motoristaController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const motoristaRoutes = Router();

motoristaRoutes.use(autenticar);

motoristaRoutes.get(
  '/',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO),
  motoristaController.listar
);
