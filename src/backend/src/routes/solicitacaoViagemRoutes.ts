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

// Registram solicitações (RF11): o Usuário Institucional e os gestores/administrador, que também
// pedem viagens para a própria unidade. Motoristas executam viagens, não as solicitam.
const PERFIS_SOLICITANTES = [PERFIS.ADMINISTRADOR, PERFIS.SOLICITANTE, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO];

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
  autorizar(...PERFIS_SOLICITANTES),
  solicitacaoViagemController.criar
);

// Consulta a disponibilidade para uma solicitação (RF16: Gestor de Frota e Administrador)
solicitacaoViagemRoutes.get(
  '/:id/disponibilidade',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
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