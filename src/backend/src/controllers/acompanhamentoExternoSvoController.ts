import { solicitacaoSvoExternaSchema } from '../validators/solicitacaoSvoExternaSchemas';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';
import {
  MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
  acompanhamentoExternoSvoService,
} from '../services/acompanhamentoExternoSvoService';
import {
  CABECALHO_CHAVE_IDEMPOTENCIA,
  CABECALHO_CREDENCIAL_EXTERNA,
  CABECALHO_PROVA_TENTATIVA,
  chaveIdempotenciaCriacaoSchema,
  consultarAcompanhamentoBodySchema,
  provaTentativaCriacaoSchema,
  recuperarComprovanteTentativaSchema,
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

export function aplicarCabecalhosSemCachePublicoMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  aplicarCabecalhosSemCachePublico(res);
  next();
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

  async recuperarComprovanteTentativa(req: Request, res: Response): Promise<void> {
    aplicarCabecalhosSemCachePublico(res);
    garantirSemCredencialNaQueryString(req);

    const body = recuperarComprovanteTentativaSchema.parse(req.body ?? {});
    const chaveHeader = lerCabecalhoUnico(req, CABECALHO_CHAVE_IDEMPOTENCIA);
    const provaHeader = lerCabecalhoUnico(req, CABECALHO_PROVA_TENTATIVA);
    if (
      (body.chave_idempotencia !== undefined && chaveHeader !== undefined && body.chave_idempotencia !== chaveHeader) ||
      (body.prova_tentativa !== undefined && provaHeader !== undefined && body.prova_tentativa !== provaHeader)
    ) {
      throw new AppError(MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA, 401, 'CREDENCIAL_EXTERNA_INVALIDA');
    }
    const chaveBruta = body.chave_idempotencia ?? chaveHeader ?? '';
    const provaBruta = body.prova_tentativa ?? provaHeader ?? '';

    const chaveValidada = chaveIdempotenciaCriacaoSchema.safeParse(chaveBruta);
    const provaValidada = provaTentativaCriacaoSchema.safeParse(provaBruta);

    if (!chaveValidada.success || !provaValidada.success) {
      throw new AppError(
        MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
        401,
        'CREDENCIAL_EXTERNA_INVALIDA'
      );
    }

    const comprovante =
      await acompanhamentoExternoSvoService.recuperarComprovanteTentativa({
        chaveIdempotencia: chaveValidada.data,
        provaTentativa: provaValidada.data,
        payloadNormalizado: solicitacaoSvoExternaSchema.parse(body.payload),
      });

    res.status(200).json({
      protocolo: comprovante.protocolo,
      credencial: comprovante.credencial,
      emitida_em: comprovante.emitidaEm,
      recuperacao_expira_em: comprovante.recuperacaoExpiraEm,
    });
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
