
import { Router } from 'express';
import { veiculoController } from '../controllers/veiculoController';

export const veiculoRoutes = Router();

veiculoRoutes.get('/svo/disponiveis', veiculoController.listarVeiculosSvoDisponiveis);
