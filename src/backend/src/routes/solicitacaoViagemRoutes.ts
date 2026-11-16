import { Router } from 'express';
import { solicitacaoViagemController } from '../controllers/solicitacaoViagemController';
import { disponibilidadeController } from '../controllers/disponibilidadeController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';
import { PERFIS } from '../constants/perfis';

export const solicitacaoViagemRoutes = Router();

// Exige autenticação para acessar as rotas
solicitacaoViagemRoutes.use(autenticar);

// Perfis autorizados a listar e analisar solicitações de viagem administrativas
// GESTOR_SVO acompanha apenas suas próprias solicitações em /minhas
const ANALISTAS_ADMINISTRATIVOS = [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA];

// Lista as solicitações administrativas encaminhadas para análise
solicitacaoViagemRoutes.get(
  '/',
  autorizar(...ANALISTAS_ADMINISTRATIVOS),
  solicitacaoViagemController.listar
);

// Lista as solicitações do próprio usuário, com o status da aprovação, motivo de recusa e agendamento
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

// Aprova ou recusa uma solicitação pendente (somente Administrador ou Gestor de Frota)
solicitacaoViagemRoutes.patch(
  '/:id/aprovar',
  autorizar(...ANALISTAS_ADMINISTRATIVOS),
  solicitacaoViagemController.aprovar
);

solicitacaoViagemRoutes.patch(
  '/:id/recusar',
  autorizar(...ANALISTAS_ADMINISTRATIVOS),
  solicitacaoViagemController.recusar
);