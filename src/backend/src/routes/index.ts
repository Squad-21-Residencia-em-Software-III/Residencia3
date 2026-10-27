import { Router } from 'express';
import { db } from '../config/database';
import { authRoutes } from './authRoutes';
import { usuarioRoutes } from './usuarioRoutes';
import { veiculoRoutes } from './veiculoRoutes';
import { abastecimentoRoutes } from './abastecimentoRoutes';
import { manutencaoRoutes } from './manutencaoRoutes';

export const routes = Router();

routes.get('/status', async (_req, res) => {
  try {
    const { rows } = await db.raw<{ rows: { now: Date }[] }>('SELECT NOW()');
    res.json({ status: 'API funcionando perfeitamente!', banco_conectado: true, horario_banco: rows[0]?.now });
  } catch (erro) {
    console.error('Erro ao conectar ao banco:', erro);
    res.status(500).json({ status: 'Erro', banco_conectado: false });
  }
});

routes.use('/auth', authRoutes);
routes.use('/usuarios', usuarioRoutes);
routes.use('/veiculos', veiculoRoutes);
routes.use('/abastecimentos', abastecimentoRoutes);
routes.use('/manutencoes', manutencaoRoutes);