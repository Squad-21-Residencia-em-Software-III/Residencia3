import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { veiculoController } from '../controllers/veiculoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const veiculoRoutes = Router();

veiculoRoutes.use(autenticar);

veiculoRoutes.get(
  '/svo/disponiveis',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO, PERFIS.GESTOR_FROTA),
  veiculoController.listarVeiculosSvoDisponiveis
);

veiculoRoutes.get(
  '/',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO),
  veiculoController.listar
);

veiculoRoutes.post(
  '/',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  veiculoController.criar
);