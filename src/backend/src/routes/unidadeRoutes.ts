import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { unidadeController } from '../controllers/unidadeController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const unidadeRoutes = Router();

unidadeRoutes.use(autenticar);

// Perfis que podem acessar os fluxos existentes de unidades e solicitações.
unidadeRoutes.get('/', autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO,
  PERFIS.SOLICITANTE, PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO), unidadeController.listar);

// A consulta e a associação de gestores às unidades são feitas apenas pelo Administrador
unidadeRoutes.get('/gestores', autorizar(PERFIS.ADMINISTRADOR), unidadeController.listarComGestores);
unidadeRoutes.post('/:id/gestores', autorizar(PERFIS.ADMINISTRADOR), unidadeController.associarGestor);
unidadeRoutes.delete('/:id/gestores/:gestorId', autorizar(PERFIS.ADMINISTRADOR), unidadeController.removerGestor);
