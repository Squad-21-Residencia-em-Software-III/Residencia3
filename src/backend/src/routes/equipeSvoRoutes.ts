import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { equipeSvoController } from '../controllers/equipeSvoController';
import { gestaoEquipesSvoController } from '../controllers/gestaoEquipesSvoController';
import { integrantesSvoController } from '../controllers/integrantesSvoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';

export const equipeSvoRoutes = Router();

// Somente usuários autorizados podem consultar equipes SVO
equipeSvoRoutes.use(autenticar);
equipeSvoRoutes.use(
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO),
  exigirAssociacaoSvo,
);

// Consulta das equipes disponíveis para o período
equipeSvoRoutes.get(
  '/disponibilidade',
  equipeSvoController.consultarDisponibilidade
);

equipeSvoRoutes.get('/', gestaoEquipesSvoController.listar);
equipeSvoRoutes.post('/', gestaoEquipesSvoController.criar);
equipeSvoRoutes.get('/integrantes', integrantesSvoController.listar);
equipeSvoRoutes.post('/integrantes', integrantesSvoController.criar);
equipeSvoRoutes.patch('/integrantes/:id', integrantesSvoController.atualizar);
equipeSvoRoutes.get('/:id/integrantes/disponibilidade', integrantesSvoController.disponibilidade);
equipeSvoRoutes.get('/:id/integrantes', integrantesSvoController.listarEquipe);
equipeSvoRoutes.put('/:id/integrantes/:usuarioId', integrantesSvoController.vincular);
equipeSvoRoutes.delete('/:id/integrantes/:usuarioId', integrantesSvoController.desvincular);
equipeSvoRoutes.get('/:id', gestaoEquipesSvoController.buscar);
equipeSvoRoutes.patch('/:id', gestaoEquipesSvoController.atualizar);
