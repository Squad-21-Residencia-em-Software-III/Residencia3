import { Router } from 'express';
import { authController } from '../controllers/authController';
import { autenticar } from '../middlewares/autenticar';
import { limitarRenovacoesSessao, limitarTentativasLogin } from '../middlewares/limitarTentativasLogin';

export const authRoutes = Router();

authRoutes.post('/login', limitarTentativasLogin, authController.login);
// Troca o refresh token por um novo par de tokens, sem estender o fim da sessão
authRoutes.post('/refresh', limitarRenovacoesSessao, authController.renovar);
authRoutes.get('/me', autenticar, authController.me);
authRoutes.patch('/senha', autenticar, authController.alterarSenha);
