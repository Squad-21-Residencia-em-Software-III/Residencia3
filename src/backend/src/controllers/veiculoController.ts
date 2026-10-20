
import { Request, Response } from 'express';
import { veiculoModel, NovoVeiculo } from '../models/veiculoModel';

export async function listarVeiculosSvoDisponiveis(
  _req: Request,
  res: Response
) {
  try {
    const veiculos = await veiculoModel.listarSvoDisponiveis();

    return res.status(200).json(veiculos);
    } catch (erro) {
    const erroBanco = erro as { code?: string };

    if (erroBanco.code === '23505') {
      return res.status(409).json({
        erro: 'Já existe um veículo cadastrado com essa placa'
      });
    }

    console.error('Erro ao cadastrar veículo:', erro);

    return res.status(500).json({
      erro: 'Erro ao cadastrar veículo'
    });
  }
}
export async function cadastrarVeiculo(req: Request, res: Response) {
  try {
    const { placa, modelo, tipo_frota, capacidade_maxima } = req.body;

    if (
      typeof placa !== 'string' || !placa.trim() ||
      typeof modelo !== 'string' || !modelo.trim() ||
      !['ADMINISTRATIVA', 'SVO'].includes(tipo_frota) ||
      !Number.isInteger(capacidade_maxima)
    ) {
      return res.status(400).json({
        erro: 'Dados do veículo inválidos'
      });
    }

    if (capacidade_maxima < 0) {
      return res.status(400).json({
        erro: 'A capacidade não pode ser negativa'
      });
    }

    if (tipo_frota === 'SVO' && capacidade_maxima > 4) {
      return res.status(400).json({
        erro: 'Veículos SVO podem ter capacidade máxima de até 4'
      });
    }

    const dados: NovoVeiculo = {
      placa: placa.trim(),
      modelo: modelo.trim(),
      tipo_frota,
      capacidade_maxima
    };

    const veiculo = await veiculoModel.cadastrarVeiculo(dados);

    return res.status(201).json(veiculo);
  } catch (erro) {
  const erroBanco = erro as { code?: string };

  if (erroBanco.code === '23505') {
    return res.status(409).json({
      erro: 'Já existe um veículo cadastrado com essa placa'
    });
  }

  console.error('Erro ao cadastrar veículo:', erro);

  return res.status(500).json({
    erro: 'Erro ao cadastrar veículo'
  });
  }
}
export async function listarVeiculos(_req: Request, res: Response) {
  try {
    const veiculos = await veiculoModel.listarVeiculos();

    return res.status(200).json(veiculos);
  } catch (erro) {
    console.error('Erro ao listar veículos:', erro);

    return res.status(500).json({
      erro: 'Erro ao consultar veículos'
    });
  }
}