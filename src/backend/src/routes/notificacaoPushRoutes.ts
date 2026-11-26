import { Router } from 'express';
import { pushController } from '../controllers/pushController';
import { env } from '../config/env';
import { autenticar, usuarioAutenticado } from '../middlewares/autenticar';
import { criarLimitador } from '../middlewares/limitarTentativasLogin';

// Alertas no aparelho (SCRUM-237). Todos os perfis, sempre com sessão e sempre sobre o próprio usuário.
// Router próprio no mesmo prefixo dos avisos (/notificacoes, SCRUM-226): os caminhos não se sobrepõem.
export const notificacaoPushRoutes = Router();

notificacaoPushRoutes.use(['/vapid-public-key', '/subscribe', '/unsubscribe', '/preferencias'], autenticar);

// Aparelho compartilhado: nada destas respostas fica no cache do navegador
notificacaoPushRoutes.use(['/vapid-public-key', '/subscribe', '/unsubscribe', '/preferencias'], (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Por usuário, além do limite geral por IP: abrir e fechar assinaturas em laço só gera carga e linhas mortas
const limitarAssinaturas = criarLimitador({
  janelaMs: 60_000,
  limite: 30,
  mensagem: 'Muitas alterações de alertas em pouco tempo. Aguarde um instante e tente de novo.',
  chave: (req) => `push:${usuarioAutenticado(req).id}`,
  // Desligado só junto com os limites gerais (testes automatizados; nunca em produção)
  pular: () => !env.limitarRequisicoes,
});

notificacaoPushRoutes.get('/vapid-public-key', pushController.chavePublica);
notificacaoPushRoutes.post('/subscribe/status', limitarAssinaturas, pushController.situacao);
notificacaoPushRoutes.post('/subscribe', limitarAssinaturas, pushController.assinar);
notificacaoPushRoutes.delete('/unsubscribe', limitarAssinaturas, pushController.cancelar);
notificacaoPushRoutes.get('/preferencias', pushController.preferencias);
notificacaoPushRoutes.patch('/preferencias/:codigo', limitarAssinaturas, pushController.salvarPreferencia);
