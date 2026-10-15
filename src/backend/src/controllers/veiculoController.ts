
import { Request, Response } from 'express';
import { veiculoModel } from '../models/veiculoModel';

export async function listarVeiculosSvoDisponiveis(
  _req: Request,
  res: Response
) {
  try {
    const veiculos = await veiculoModel.listarSvoDisponiveis();

    return res.status(200).json(veiculos);
  } catch (erro) {
    console.error('Erro ao consultar veículos SVO:', erro);

    return res.status(500).json({
      erro: 'Erro ao consultar veículos SVO disponíveis'
    });
  }
}
