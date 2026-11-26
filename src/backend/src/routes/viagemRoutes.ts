import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { viagemController } from '../controllers/viagemController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';

export const viagemRoutes = Router();

viagemRoutes.use(autenticar);
viagemRoutes.get('/coletas-svo/minhas', autorizar(PERFIS.INTEGRANTE_SVO), viagemController.listarMinhasColetasSvo);
// A consulta administrativa é limitada ao titular pelo service e não é operação SVO.
viagemRoutes.get('/minhas', autorizar(PERFIS.GESTOR_SVO), viagemController.listarMinhasAdministrativas);
// O Gestor SVO só opera viagens SVO se estiver associado à unidade SVO
viagemRoutes.use(exigirAssociacaoSvo);

const gestores = autorizar(
  PERFIS.ADMINISTRADOR,
  PERFIS.GESTOR_FROTA,
  PERFIS.GESTOR_SVO
);

const gestoresEMotoristas = autorizar(
  PERFIS.ADMINISTRADOR,
  PERFIS.GESTOR_FROTA,
  PERFIS.GESTOR_SVO,
  PERFIS.MOTORISTA_FROTA,
  PERFIS.MOTORISTA_SVO
);

// Gestores consultam todas as viagens.
// Motoristas consultam somente as próprias viagens,
// conforme o filtro aplicado no service.
viagemRoutes.get('/', gestoresEMotoristas, viagemController.listar);

// Consulta reduzida das viagens administrativas vinculadas às solicitações do JWT.
viagemRoutes.get('/ordens-svo/pendentes', autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO), viagemController.listarOrdensPendentesSvo);
viagemRoutes.get('/ordens-svo/alertas', autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO), viagemController.consultarAlertasSvo);
viagemRoutes.get('/ordens-svo/:id/designacoes', autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO), viagemController.listarDesignacoesSvo);
viagemRoutes.post('/ordens-svo/:id/reprogramar', autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO), viagemController.reprogramarOrdemSvo);
viagemRoutes.patch(
  '/ordens-svo/:id/chegar-local',
  autorizar(PERFIS.MOTORISTA_SVO),
  viagemController.registrarChegadaLocalSvo
);

viagemRoutes.patch('/administrativas/:id/reprogramar',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA), viagemController.reprogramarAdministrativa);

viagemRoutes.post('/', gestores, viagemController.criar);

viagemRoutes.patch('/:id/iniciar', gestoresEMotoristas, viagemController.iniciar);

viagemRoutes.patch('/:id/finalizar', gestoresEMotoristas, viagemController.finalizar);

viagemRoutes.patch('/:id/cancelar', gestores, viagemController.cancelar);
