import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { solicitacaoSvoController } from '../controllers/solicitacaoSvoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const solicitacaoSvoRoutes = Router();

// Registro e triagem das solicitações da população (RF19/RF20)
solicitacaoSvoRoutes.use(autenticar);
solicitacaoSvoRoutes.use(autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO));

solicitacaoSvoRoutes.get('/', solicitacaoSvoController.listar);
solicitacaoSvoRoutes.get('/:id', solicitacaoSvoController.buscarPorId);
solicitacaoSvoRoutes.post('/', solicitacaoSvoController.registrar);
