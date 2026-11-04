import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { unidadeController } from '../controllers/unidadeController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const unidadeRoutes = Router();

// A associação de gestores às unidades é feita apenas pelo Administrador
unidadeRoutes.use(autenticar, autorizar(PERFIS.ADMINISTRADOR));

unidadeRoutes.get('/', unidadeController.listar);
unidadeRoutes.post('/:id/gestores', unidadeController.associarGestor);
unidadeRoutes.delete('/:id/gestores/:gestorId', unidadeController.removerGestor);
