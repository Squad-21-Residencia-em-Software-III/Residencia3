import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { manutencaoController } from '../controllers/manutencaoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const manutencaoRoutes = Router();

manutencaoRoutes.use(autenticar);
manutencaoRoutes.use(autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA));

manutencaoRoutes.post('/', manutencaoController.criar);

manutencaoRoutes.get('/veiculo/:veiculoId', manutencaoController.listarPorVeiculo);
