
import { Router } from 'express';
import { solicitacaoViagemController } from '../controllers/solicitacaoViagemController';
import { autenticar } from '../middlewares/autenticar';

export const solicitacaoViagemRoutes = Router();

// Exige autenticação para acessar as rotas
solicitacaoViagemRoutes.use(autenticar);

// Registra uma nova solicitação de viagem
solicitacaoViagemRoutes.post(
  '/',
  solicitacaoViagemController.criar
);
