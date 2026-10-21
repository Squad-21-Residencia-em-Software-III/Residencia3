import { Router } from 'express';
import { authController } from '../controllers/authController';
import { autenticar } from '../middlewares/autenticar';
import { limitarTentativasLogin } from '../middlewares/limitarTentativasLogin';

export const authRoutes = Router();

authRoutes.post('/login', limitarTentativasLogin, authController.login);
authRoutes.get('/me', autenticar, authController.me);
authRoutes.patch('/senha', autenticar, authController.alterarSenha);
