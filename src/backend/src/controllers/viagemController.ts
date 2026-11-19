import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { viagemService } from '../services/viagemService';
import { listarMinhasColetasSvo } from '../services/minhasColetasSvoService';
import { consultarDesignacoesSvo } from '../services/designacoesSvoService';
import { garantirPerfilOperacional } from '../services/autorizacaoOperacionalSvo';
import { idParamSchema } from '../validators/comuns';
import { z } from 'zod';
import {
  cancelarViagemSchema,
  criarViagemSchema,
  finalizarViagemSchema,
  iniciarViagemSchema,
} from '../validators/viagemSchemas';

const paginacaoSchema = z.object({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const viagemController = {
  async listarDesignacoesSvo(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    res.json(await consultarDesignacoesSvo(id));
  },
  async listarMinhasColetasSvo(req: Request, res: Response): Promise<void> {
    const { pagina, limite } = paginacaoSchema.parse(req.query);
    res.json(await listarMinhasColetasSvo(usuarioAutenticado(req).id, pagina, limite));
  },
  async reprogramarOrdemSvo(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const dados = criarViagemSchema.parse(req.body);
    if (dados.tipo_operacao !== 'SVO') {
      res.status(400).json({ erro: 'Apenas coletas SVO podem ser reprogramadas nesta rota' });
      return;
    }
    res.json(await viagemService.reprogramarOrdemSvo(id, dados, usuarioAutenticado(req)));
  },
  async consultarAlertasSvo(req: Request, res: Response): Promise<void> {
    const { pagina, limite } = paginacaoSchema.parse(req.query);
    res.json(await viagemService.consultarAlertasSvo(usuarioAutenticado(req), pagina, limite));
  },
  async listarOrdensPendentesSvo(req: Request, res: Response): Promise<void> {
    const { pagina, limite } = paginacaoSchema.parse(req.query);
    res.json(await viagemService.listarOrdensPendentesSvo(usuarioAutenticado(req), pagina, limite));
  },
  async listarMinhasAdministrativas(req: Request, res: Response): Promise<void> {
    const { pagina, limite } = paginacaoSchema.parse(req.query);
    res.json(await viagemService.listarMinhasAdministrativas(usuarioAutenticado(req), pagina, limite));
  },
  async listar(req: Request, res: Response): Promise<void> {
  const autor = usuarioAutenticado(req);
  res.json(await viagemService.listar(autor));
  },

  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarViagemSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const viagem = await viagemService.criar(dados, autor);
    res.status(dados.tipo_operacao === 'SVO' ? 200 : 201).json(viagem);
  },

  async registrarChegadaLocalSvo(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const autor = usuarioAutenticado(req);

    res.json(await viagemService.registrarChegadaLocalSvo(id, autor));
  },

  async iniciar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { tipo_operacao, km_inicial, evidencia_id } = iniciarViagemSchema.parse(req.body);
    const autor = usuarioAutenticado(req);
    garantirPerfilOperacional(tipo_operacao, autor);

    res.json(await viagemService.iniciarViagem(tipo_operacao, id, km_inicial, autor, evidencia_id));
  },

  async finalizar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { tipo_operacao, km_final, evidencia_id } = finalizarViagemSchema.parse(req.body);
    const autor = usuarioAutenticado(req);
    garantirPerfilOperacional(tipo_operacao, autor);

    res.json(await viagemService.finalizarViagem(tipo_operacao, id, km_final, autor, evidencia_id));
  },

  async cancelar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    // O corpo é opcional: sem ele, a viagem é tratada como administrativa
    const { tipo_operacao, cancelar_solicitacao } = cancelarViagemSchema.parse(req.body ?? {});
    const autor = usuarioAutenticado(req);

    res.json(await viagemService.cancelarViagem(tipo_operacao, id, autor, cancelar_solicitacao));
  },
};
