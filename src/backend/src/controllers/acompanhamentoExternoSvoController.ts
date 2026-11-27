import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';
import {
  MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
  acompanhamentoExternoSvoService,
} from '../services/acompanhamentoExternoSvoService';
import {
  CABECALHO_CREDENCIAL_EXTERNA,
  consultarAcompanhamentoBodySchema,
  revogarCredencialExternaSchema,
} from '../validators/acompanhamentoExternoSvoSchemas';
import { idParamSchema } from '../validators/comuns';

export function aplicarCabecalhosSemCachePublico(res: Response): void {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, private, max-age=0'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function garantirSemCredencialNaQueryString(req: Request): void {
  const chavesQuery = Object.keys(req.query ?? {});
  if (chavesQuery.length > 0) {
    throw new AppError(
      'Parâmetros de consulta na URL não são permitidos no acompanhamento externo por segurança.',
      400,
      'CREDENCIAIS_NA_URL_PROIBIDAS'
    );
  }
}

function lerCabecalhoUnico(req: Request, nome: string): string | undefined {
  const valor = req.headers[nome.toLowerCase()];
  if (Array.isArray(valor)) return valor[0]?.trim();
  return typeof valor === 'string' ? valor.trim() : undefined;
}

export const acompanhamentoExternoSvoController = {
  async consultarPorPost(req: Request, res: Response): Promise<void> {
    aplicarCabecalhosSemCachePublico(res);
    garantirSemCredencialNaQueryString(req);

    const body = consultarAcompanhamentoBodySchema.parse(req.body ?? {});
    const credencialHeader = lerCabecalhoUnico(req, CABECALHO_CREDENCIAL_EXTERNA);
    const credencial = body.credencial ?? credencialHeader ?? '';

    if (
      body.credencial &&
      credencialHeader &&
      body.credencial !== credencialHeader
    ) {
      throw new AppError(
        MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
        401,
        'CREDENCIAL_EXTERNA_INVALIDA'
      );
    }

    const resultado =
      await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
        body.protocolo,
        credencial
      );

    res.status(200).json(resultado);
  },

  async consultarPorProtocoloNoPath(req: Request, res: Response): Promise<void> {
    aplicarCabecalhosSemCachePublico(res);
    garantirSemCredencialNaQueryString(req);

    const protocoloParam =
      typeof req.params.protocolo === 'string' ? req.params.protocolo : '';
    const credencialHeader =
      lerCabecalhoUnico(req, CABECALHO_CREDENCIAL_EXTERNA) ?? '';

    const resultado =
      await acompanhamentoExternoSvoService.consultarAcompanhamentoPublico(
        protocoloParam,
        credencialHeader
      );

    res.status(200).json(resultado);
  },

  async revogarCredencial(req: Request, res: Response): Promise<void> {
    aplicarCabecalhosSemCachePublico(res);
    const { id } = idParamSchema.parse(req.params);
    const { motivo } = revogarCredencialExternaSchema.parse(req.body ?? {});
    const autor = usuarioAutenticado(req);

    const resultado = await acompanhamentoExternoSvoService.revogarCredencial(
      id,
      motivo,
      autor
    );

    res.status(200).json(resultado);
  },
};
