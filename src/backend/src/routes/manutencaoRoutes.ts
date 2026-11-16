import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { manutencaoController } from '../controllers/manutencaoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';
import { restringirFrotaAdministrativa } from '../middlewares/restringirFrotaAdministrativa';

export const manutencaoRoutes = Router();

manutencaoRoutes.use(autenticar);

manutencaoRoutes.post(
  '/',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  restringirFrotaAdministrativa('veiculo-body'), manutencaoController.criar
);

manutencaoRoutes.get(
  '/veiculo/:veiculoId',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  restringirFrotaAdministrativa('veiculo-param'), manutencaoController.listarPorVeiculo
);

manutencaoRoutes.put(
  '/:id',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  restringirFrotaAdministrativa('manutencao'), manutencaoController.atualizar
);

manutencaoRoutes.patch(
  '/:id/status',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  restringirFrotaAdministrativa('manutencao'), manutencaoController.atualizarStatus
);

manutencaoRoutes.delete(
  '/:id',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  restringirFrotaAdministrativa('manutencao'), manutencaoController.excluir
);
