
import { Router } from 'express';
import { solicitacaoViagemController } from '../controllers/solicitacaoViagemController';
import { disponibilidadeController } from '../controllers/disponibilidadeController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';
import { PERFIS } from '../constants/perfis';

export const solicitacaoViagemRoutes = Router();

// Exige autenticação para acessar as rotas
solicitacaoViagemRoutes.use(autenticar);

// Perfis que analisam solicitações; o Gestor SVO apenas as da unidade SVO a que está associado
const ANALISTAS = [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO];

// Lista as solicitações encaminhadas ao usuário, conforme a unidade
solicitacaoViagemRoutes.get(
  '/',
  autorizar(...ANALISTAS),
  solicitacaoViagemController.listar
);

// Lista as solicitações do próprio usuário, com o status da aprovação e do agendamento
solicitacaoViagemRoutes.get(
  '/minhas',
  solicitacaoViagemController.listarMinhas
);

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

// Aprova ou recusa uma solicitação pendente
solicitacaoViagemRoutes.patch(
  '/:id/aprovar',
  autorizar(...ANALISTAS),
  solicitacaoViagemController.aprovar
);

solicitacaoViagemRoutes.patch(
  '/:id/recusar',
  autorizar(...ANALISTAS),
  solicitacaoViagemController.recusar
);
