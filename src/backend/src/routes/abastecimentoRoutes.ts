
import { Router } from 'express';
import { abastecimentoController } from '../controllers/abastecimentoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';
import { PERFIS } from '../constants/perfis';

export const abastecimentoRoutes = Router();

abastecimentoRoutes.use(autenticar);

abastecimentoRoutes.post(
  '/',
  autorizar(
    PERFIS.ADMINISTRADOR,
    PERFIS.GESTOR_FROTA,
    PERFIS.MOTORISTA_FROTA,
    PERFIS.MOTORISTA_SVO
  ),
  abastecimentoController.criar
);

abastecimentoRoutes.get(
  '/veiculo/:veiculoId',
  autorizar(
    PERFIS.ADMINISTRADOR,
    PERFIS.GESTOR_FROTA,
    PERFIS.MOTORISTA_FROTA,
    PERFIS.MOTORISTA_SVO
  ),
  abastecimentoController.listarPorVeiculo
);
