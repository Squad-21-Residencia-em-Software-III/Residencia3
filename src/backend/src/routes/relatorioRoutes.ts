import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { relatorioController } from '../controllers/relatorioController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const relatorioRoutes = Router();

// RF18/RN20: exportação de relatórios gerenciais é do Gestor de Frota e do Administrador
relatorioRoutes.use(autenticar, autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA));

relatorioRoutes.get('/', relatorioController.listar);
relatorioRoutes.get('/:tipo/exportar', relatorioController.exportar);
