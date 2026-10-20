import { Router } from 'express';
import {
  listarVeiculosSvoDisponiveis,
  cadastrarVeiculo,
  listarVeiculos
} from '../controllers/veiculoController';

export const veiculoRoutes = Router();

veiculoRoutes.get('/svo/disponiveis', listarVeiculosSvoDisponiveis);

veiculoRoutes.get('/', listarVeiculos);

veiculoRoutes.post('/', cadastrarVeiculo);