
import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { auditoriaController } from '../controllers/auditoriaController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const auditoriaRoutes = Router();

// Exigir que o usuário esteja autenticado
auditoriaRoutes.use(autenticar);

// Permitir acesso somente ao administrador
auditoriaRoutes.use(autorizar(PERFIS.ADMINISTRADOR));

// Consultar os registros de auditoria
auditoriaRoutes.get('/', auditoriaController.listar);
