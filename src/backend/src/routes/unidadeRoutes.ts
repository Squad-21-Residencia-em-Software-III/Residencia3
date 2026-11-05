import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { unidadeController } from '../controllers/unidadeController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const unidadeRoutes = Router();

unidadeRoutes.use(autenticar);

// Qualquer usuário autenticado consulta as unidades para escolher a da solicitação
unidadeRoutes.get('/', unidadeController.listar);

// A consulta e a associação de gestores às unidades são feitas apenas pelo Administrador
unidadeRoutes.get('/gestores', autorizar(PERFIS.ADMINISTRADOR), unidadeController.listarComGestores);
unidadeRoutes.post('/:id/gestores', autorizar(PERFIS.ADMINISTRADOR), unidadeController.associarGestor);
unidadeRoutes.delete('/:id/gestores/:gestorId', autorizar(PERFIS.ADMINISTRADOR), unidadeController.removerGestor);
