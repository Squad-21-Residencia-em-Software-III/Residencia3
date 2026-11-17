import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { equipeSvoController } from '../controllers/equipeSvoController';
import { gestaoEquipesSvoController } from '../controllers/gestaoEquipesSvoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const equipeSvoRoutes = Router();

// Somente usuários autorizados podem consultar equipes SVO
equipeSvoRoutes.use(autenticar);
equipeSvoRoutes.use(
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO)
);

// Consulta das equipes disponíveis para o período
equipeSvoRoutes.get(
  '/disponibilidade',
  equipeSvoController.consultarDisponibilidade
);

equipeSvoRoutes.get('/', gestaoEquipesSvoController.listar);
equipeSvoRoutes.post('/', gestaoEquipesSvoController.criar);
equipeSvoRoutes.get('/:id', gestaoEquipesSvoController.buscar);
equipeSvoRoutes.patch('/:id', gestaoEquipesSvoController.atualizar);
