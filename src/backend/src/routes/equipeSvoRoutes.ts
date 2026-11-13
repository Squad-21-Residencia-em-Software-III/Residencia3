import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { equipeSvoController } from '../controllers/equipeSvoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const equipeSvoRoutes = Router();

// Somente usuários autorizados podem consultar equipes SVO
equipeSvoRoutes.use(autenticar);
equipeSvoRoutes.use(
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO)
);

// Consulta das equipes disponíveis conforme escala
equipeSvoRoutes.get(
  '/disponibilidade',
  equipeSvoController.consultarDisponibilidade
);
