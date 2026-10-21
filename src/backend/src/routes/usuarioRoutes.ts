import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { usuarioController } from '../controllers/usuarioController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const usuarioRoutes = Router();

usuarioRoutes.use(autenticar, autorizar(PERFIS.ADMINISTRADOR));

usuarioRoutes.get('/perfis', usuarioController.listarPerfis);
usuarioRoutes.get('/', usuarioController.listar);
usuarioRoutes.post('/', usuarioController.criar);
usuarioRoutes.get('/:id', usuarioController.buscarPorId);
usuarioRoutes.patch('/:id', usuarioController.atualizar);
usuarioRoutes.patch('/:id/senha', usuarioController.redefinirSenha);
