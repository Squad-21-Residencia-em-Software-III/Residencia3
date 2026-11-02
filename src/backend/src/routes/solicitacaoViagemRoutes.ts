
import { Router } from 'express';
import { solicitacaoViagemController } from '../controllers/solicitacaoViagemController';
import { disponibilidadeController } from '../controllers/disponibilidadeController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';
import { PERFIS } from '../constants/perfis';

export const solicitacaoViagemRoutes = Router();

// Exige autenticação para acessar as rotas
solicitacaoViagemRoutes.use(autenticar);

// Registra uma nova solicitação de viagem
solicitacaoViagemRoutes.post(
  '/',
  solicitacaoViagemController.criar
);

// Consulta a disponibilidade para uma solicitação
// Acesso exclusivo ao Gestor de Frota
solicitacaoViagemRoutes.get(
  '/:id/disponibilidade',
  autorizar(PERFIS.GESTOR_FROTA),
  disponibilidadeController.consultar
);
