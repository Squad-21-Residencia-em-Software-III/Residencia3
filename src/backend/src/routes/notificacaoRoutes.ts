import { Router } from 'express';
import { notificacaoController } from '../controllers/notificacaoController';
import { autenticar } from '../middlewares/autenticar';

export const notificacaoRoutes = Router();

// Todos os perfis: cada usuário acessa só os próprios avisos (notificacaoService)
notificacaoRoutes.use(autenticar);

// Aparelho compartilhado: os avisos não ficam guardados no cache do navegador
notificacaoRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

notificacaoRoutes.get('/', notificacaoController.listar);
notificacaoRoutes.get('/contador', notificacaoController.contador);
notificacaoRoutes.get('/badge', notificacaoController.badge);
notificacaoRoutes.get('/:id', notificacaoController.obterAutorizada);
notificacaoRoutes.patch('/ler-todas', notificacaoController.marcarTodasLidas);
// Antes de /:id/lida, que também casaria com este caminho
notificacaoRoutes.patch('/referencia/lida', notificacaoController.marcarReferenciaLida);
notificacaoRoutes.patch('/:id/lida', notificacaoController.marcarLida);
