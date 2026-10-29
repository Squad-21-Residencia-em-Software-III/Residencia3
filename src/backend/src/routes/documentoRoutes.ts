import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { documentoController } from '../controllers/documentoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const documentoRoutes = Router();

documentoRoutes.use(autenticar);

documentoRoutes.get(
  '/vencimentos',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  documentoController.listarVencimentos
);