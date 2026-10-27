
import { Router } from 'express';
import { abastecimentoController } from '../controllers/abastecimentoController';
import { autenticar } from '../middlewares/autenticar';

export const abastecimentoRoutes = Router();

abastecimentoRoutes.use(autenticar);

abastecimentoRoutes.post(
  '/',
  abastecimentoController.criar
);

abastecimentoRoutes.get(
  '/veiculo/:veiculoId',
  abastecimentoController.listarPorVeiculo
);
