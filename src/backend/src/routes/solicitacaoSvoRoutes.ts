import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { solicitacaoSvoController } from '../controllers/solicitacaoSvoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';

export const solicitacaoSvoRoutes = Router();
solicitacaoSvoRoutes.use(autenticar, autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO));
solicitacaoSvoRoutes.get('/', solicitacaoSvoController.listar);
solicitacaoSvoRoutes.get('/:id', solicitacaoSvoController.detalhar);
solicitacaoSvoRoutes.patch('/:id/confirmar', solicitacaoSvoController.confirmar);
