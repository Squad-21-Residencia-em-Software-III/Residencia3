import { Router, type RequestHandler } from 'express';
import { acompanharExternoAtivo } from '../config/acompanhamentoExternoSvo';
import { acompanhamentoExternoSvoController, aplicarCabecalhosSemCachePublico } from '../controllers/acompanhamentoExternoSvoController';
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

export const exigirAcompanhamentoExternoAtivo: RequestHandler = (
  _req,
  res,
  next
) => {
  aplicarCabecalhosSemCachePublico(res);
  if (!acompanharExternoAtivo()) {
    res.status(404).json({
      erro: 'Rota não encontrada',
      codigo: 'RECURSO_DESATIVADO',
    });
    return;
  }
  next();
};

export const acompanhamentoExternoSvoRoutes = Router();

acompanhamentoExternoSvoRoutes.use(exigirAcompanhamentoExternoAtivo);
acompanhamentoExternoSvoRoutes.use(limitarTentativasAcompanhamentoExterno);

// 1. Consulta por POST com protocolo e credencial no body ou no header X-Credencial-Acompanhamento
acompanhamentoExternoSvoRoutes.post(
  '/acompanhamento',
  acompanhamentoExternoSvoController.consultarPorPost
);

// 2. Consulta por GET com protocolo no path e credencial exclusivamente no header X-Credencial-Acompanhamento
acompanhamentoExternoSvoRoutes.get(
  '/acompanhamento/:protocolo',
  acompanhamentoExternoSvoController.consultarPorProtocoloNoPath
);

// 3. Recuperacao autenticada de comprovante (protocolo + credencial) quando a resposta do POST de criacao se perdeu apos o commit
acompanhamentoExternoSvoRoutes.post(
  '/recuperar-comprovante',
  acompanhamentoExternoSvoController.recuperarComprovanteTentativa
);
