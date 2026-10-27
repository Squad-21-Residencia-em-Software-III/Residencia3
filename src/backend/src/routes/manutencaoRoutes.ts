import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { manutencaoController } from '../controllers/manutencaoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const manutencaoRoutes = Router();

manutencaoRoutes.use(autenticar);

manutencaoRoutes.post(
  '/',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  manutencaoController.criar
);

manutencaoRoutes.get(
  '/veiculo/:veiculoId',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO),
  manutencaoController.listarPorVeiculo
);

manutencaoRoutes.patch(
  '/:id/status',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  manutencaoController.atualizarStatus
);

