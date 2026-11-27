import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { acompanhamentoExternoSvoController } from '../controllers/acompanhamentoExternoSvoController';
import { solicitacaoSvoController } from '../controllers/solicitacaoSvoController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';
import { acompanhamentoExternoSvoRoutes } from './acompanhamentoExternoSvoRoutes';

export const solicitacaoSvoRoutes = Router();

// Rotas publicas do portal SVO para acompanhamento externo por credencial secreta (SCRUM-266).
// Montadas antes de autenticar e antes de /:id para nunca colidir com rotas internas nem exigir JWT.
solicitacaoSvoRoutes.use('/externas', acompanhamentoExternoSvoRoutes);

// Registro e triagem das solicitações da população (RF19/RF20)
solicitacaoSvoRoutes.use(autenticar);
solicitacaoSvoRoutes.use(autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO), exigirAssociacaoSvo);

solicitacaoSvoRoutes.get('/', solicitacaoSvoController.listar);
solicitacaoSvoRoutes.get('/:id', solicitacaoSvoController.buscarPorId);
solicitacaoSvoRoutes.post('/', solicitacaoSvoController.registrar);
// Início verificável de análise na triagem de solicitação externa (SCRUM-266 / SCRUM-270)
solicitacaoSvoRoutes.patch('/:id/iniciar-analise', solicitacaoSvoController.iniciarAnalise);
// Confirmação e geração da ordem de coleta (BL27 / RF20, RF21)
solicitacaoSvoRoutes.patch('/:id/confirmar', solicitacaoSvoController.confirmar);
// Recusa da solicitação em triagem com justificativa obrigatória (RF20)
solicitacaoSvoRoutes.patch('/:id/recusar', solicitacaoSvoController.recusar);
// Revogação explícita da credencial externa de acompanhamento (SCRUM-266)
solicitacaoSvoRoutes.post(
  '/:id/credencial-externa/revogar',
  acompanhamentoExternoSvoController.revogarCredencial
);