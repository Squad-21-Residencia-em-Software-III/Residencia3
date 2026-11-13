import { Router } from 'express';
import { authController } from '../controllers/authController';
import { autenticar } from '../middlewares/autenticar';
import { limitarRenovacoesSessao, limitarTentativasLogin } from '../middlewares/limitarTentativasLogin';
import { verificarOrigem } from '../middlewares/verificarOrigem';

export const authRoutes = Router();

// Rotas que emitem, leem ou removem o cookie de sessão validam a origem (CSRF)
authRoutes.post('/login', verificarOrigem, limitarTentativasLogin, authController.login);
// Troca o refresh token do cookie por um novo access token, sem estender o fim da sessão
authRoutes.post('/refresh', verificarOrigem, limitarRenovacoesSessao, authController.renovar);
// Não exige access token: deve funcionar mesmo com a sessão expirada
authRoutes.post('/logout', verificarOrigem, authController.logout);
authRoutes.get('/me', autenticar, authController.me);
authRoutes.patch('/senha', verificarOrigem, autenticar, authController.alterarSenha);
