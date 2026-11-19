import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { PERFIS } from '../constants/perfis';
import { evidenciaOdometroController } from '../controllers/evidenciaOdometroController';
import { AppError } from '../errors/AppError';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';
import { criarLimitadorConcorrencia } from '../middlewares/limitarConcorrencia';
import { criarLimitadorTempo } from '../middlewares/limitarTempoRequisicao';
import {
  armazenamentoConfigurado,
  MENSAGEM_ARMAZENAMENTO_DESATIVADO,
} from '../services/armazenamentoEvidencias';
import { TAMANHO_MAXIMO_FOTO_BYTES } from '../services/imagemEvidencias';

// Fotos do odômetro (SCRUM-208/209). Contrato: docs/evidencias-odometro.md
export const evidenciaOdometroRoutes = Router();

// Envio de foto pelo celular pode ser lento: tempo próprio, maior que o geral da API
export const TEMPO_ENVIO_FOTO_MS = 60_000;

export function ehEnvioDeFotoOdometro(req: Request): boolean {
  return req.method === 'POST' && /^\/api\/evidencias-odometro\/?$/.test(req.path);
}

const gestores = autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO);
const gestoresEMotoristas = autorizar(
  PERFIS.ADMINISTRADOR,
  PERFIS.GESTOR_FROTA,
  PERFIS.GESTOR_SVO,
  PERFIS.MOTORISTA_FROTA,
  PERFIS.MOTORISTA_SVO
);
const limitarEnvios = criarLimitadorConcorrencia(() => 2);
const limitarLeituras = criarLimitadorConcorrencia(() => 4);

// Arquivo só na memória (nunca no disco temporário); um arquivo e poucos campos curtos
const receberArquivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_FOTO_BYTES, files: 1, fields: 4, fieldSize: 200, parts: 5 },
}).single('arquivo');

function receberFoto(req: Request, res: Response, next: NextFunction): void {
  receberArquivo(req, res, (erro: unknown) => {
    if (!erro) return next();
    if (erro instanceof multer.MulterError) {
      return next(
        erro.code === 'LIMIT_FILE_SIZE'
          ? new AppError('A foto deve ter no máximo 10 MB', 413)
          : new AppError('Envio inválido: mande apenas a foto no campo "arquivo" e os campos da viagem', 400)
      );
    }
    next(erro);
  });
}

// Sem armazenamento configurado, recusa antes de receber o arquivo
function exigirArmazenamento(_req: Request, _res: Response, next: NextFunction): void {
  if (!armazenamentoConfigurado()) {
    throw new AppError(MENSAGEM_ARMAZENAMENTO_DESATIVADO, 503);
  }
  next();
}

evidenciaOdometroRoutes.use(autenticar);
evidenciaOdometroRoutes.use(exigirAssociacaoSvo);

evidenciaOdometroRoutes.post(
  '/',
  criarLimitadorTempo(() => TEMPO_ENVIO_FOTO_MS),
  gestoresEMotoristas,
  exigirArmazenamento,
  limitarEnvios,
  receberFoto,
  evidenciaOdometroController.enviar
);

// Motoristas consultam só a situação da própria viagem (o modal sabe se a foto já foi registrada)
evidenciaOdometroRoutes.get('/', gestoresEMotoristas, evidenciaOdometroController.consultar);

evidenciaOdometroRoutes.get('/configuracao', gestoresEMotoristas, evidenciaOdometroController.configuracao);
evidenciaOdometroRoutes.get('/excecoes', gestores, evidenciaOdometroController.listarExcecoes);
evidenciaOdometroRoutes.post('/excecoes',
  autorizar(PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO), evidenciaOdometroController.solicitarExcecao);
evidenciaOdometroRoutes.patch('/excecoes/:id', gestores, evidenciaOdometroController.decidirExcecao);
evidenciaOdometroRoutes.get('/:id/arquivo', gestores, limitarLeituras, evidenciaOdometroController.arquivo);
