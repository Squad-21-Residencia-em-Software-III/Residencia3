
import { Router } from 'express';
import { listarVeiculosSvoDisponiveis } from '../controllers/veiculoController';

export const veiculoRoutes = Router();

veiculoRoutes.get('/svo/disponiveis', listarVeiculosSvoDisponiveis);
