import { Router } from 'express';
import {
  acompanhamentoExternoSvoController,
  aplicarCabecalhosSemCachePublicoMiddleware,
} from '../controllers/acompanhamentoExternoSvoController';
import { exigirRecursoAtivo } from '../middlewares/exigirRecursoAtivo';
import { criarLimitador } from '../middlewares/limitarTentativasLogin';

const QUINZE_MINUTOS_MS = 15 * 60 * 1000;

// Rate-limit especifico contra enumeracao de protocolos e forca bruta de credenciais (SCRUM-266):
// Conta apenas respostas com falha (401/400/404) para nao penalizar consultas legitimas em NAT hospitalar.
export const limitarTentativasAcompanhamentoExterno = criarLimitador({
  janelaMs: QUINZE_MINUTOS_MS,
  limite: 15,
  somenteFalhas: true,
  mensagem:
    'Muitas tentativas de consulta com credencial inválida. Aguarde alguns minutos antes de tentar novamente.',
});

export const acompanhamentoExternoSvoRoutes = Router();

// Middlewares aplicados por endpoint (sem .use global) para manter independencia entre flags
// de portal de cadastro (portalSvo) e consulta publica (acompanhamentoExterno) no prefixo /externas.

// 1. Consulta por POST com protocolo e credencial no body ou no header X-Credencial-Acompanhamento
acompanhamentoExternoSvoRoutes.post(
  '/acompanhamento',
  aplicarCabecalhosSemCachePublicoMiddleware,
  exigirRecursoAtivo('acompanhamentoExterno'),
  limitarTentativasAcompanhamentoExterno,
  acompanhamentoExternoSvoController.consultarPorPost
);

// 2. Consulta por GET com protocolo no path e credencial exclusivamente no header X-Credencial-Acompanhamento
acompanhamentoExternoSvoRoutes.get(
  '/acompanhamento/:protocolo',
  aplicarCabecalhosSemCachePublicoMiddleware,
  exigirRecursoAtivo('acompanhamentoExterno'),
  limitarTentativasAcompanhamentoExterno,
  acompanhamentoExternoSvoController.consultarPorProtocoloNoPath
);

// 3. Recuperacao autenticada de comprovante (protocolo + credencial) apos perda da resposta no POST de criacao
acompanhamentoExternoSvoRoutes.post(
  '/recuperar-comprovante',
  aplicarCabecalhosSemCachePublicoMiddleware,
  exigirRecursoAtivo('portalSvo'),
  limitarTentativasAcompanhamentoExterno,
  acompanhamentoExternoSvoController.recuperarComprovanteTentativa
);
