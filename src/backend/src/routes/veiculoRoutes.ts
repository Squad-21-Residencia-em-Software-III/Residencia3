import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { veiculoController } from '../controllers/veiculoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';

export const veiculoRoutes = Router();

veiculoRoutes.use(autenticar);
// O Gestor SVO só consulta a frota se estiver associado à unidade SVO
veiculoRoutes.use(exigirAssociacaoSvo);

veiculoRoutes.get(
  '/svo/disponiveis',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO, PERFIS.GESTOR_FROTA),
  veiculoController.listarVeiculosSvoDisponiveis
);

veiculoRoutes.get(
  '/svo/ocupacao',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO, PERFIS.GESTOR_FROTA),
  veiculoController.listarOcupacaoSvo
);

veiculoRoutes.get(
  '/',
  autorizar(
    PERFIS.ADMINISTRADOR,
    PERFIS.GESTOR_FROTA,
    PERFIS.GESTOR_SVO,
    PERFIS.MOTORISTA_FROTA,
    PERFIS.MOTORISTA_SVO
  ),
  veiculoController.listar
);

veiculoRoutes.post(
  '/',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  veiculoController.criar
);

veiculoRoutes.put(
  '/:id',
  autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA),
  veiculoController.atualizar
);
