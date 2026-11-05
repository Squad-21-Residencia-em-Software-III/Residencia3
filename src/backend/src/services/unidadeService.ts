import { db } from '../config/database';
import { podeGerirUnidade } from '../constants/unidades';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { unidadeModel, type Unidade, type UnidadeComGestores } from '../models/unidadeModel';
import { usuarioModel } from '../models/usuarioModel';

const CHAVE_DUPLICADA = '23505';
const JA_ASSOCIADO = 'Este gestor já está associado a esta unidade';

export const unidadeService = {
  // Opções para o solicitante escolher a unidade, sem dados dos gestores
  async listar(): Promise<Unidade[]> {
    return unidadeModel.listar();
  },

  async listarComGestores(): Promise<UnidadeComGestores[]> {
    return unidadeModel.listarComGestores();
  },

  async associarGestor(unidadeId: number, gestorId: number, autorId: number): Promise<UnidadeComGestores> {
    return db.transaction(async (trx) => {
      const unidade = await unidadeModel.buscarPorId(unidadeId, trx);
      if (!unidade) {
        throw new AppError('Unidade não encontrada', 404);
      }

      const gestor = await usuarioModel.buscarPorId(gestorId, trx);
      if (!gestor) {
        throw new AppError('Usuário não encontrado', 404);
      }

      if (!gestor.ativo) {
        throw new AppError('Usuário inativo não pode ser associado a uma unidade', 400);
      }

      if (!podeGerirUnidade(gestor.perfil, unidade.nome)) {
        throw new AppError(`O perfil ${gestor.perfil} não pode gerir a unidade ${unidade.nome}`, 400);
      }

      if (await unidadeModel.estaAssociado(unidadeId, gestorId, trx)) {
        throw new AppError(JA_ASSOCIADO, 409);
      }

      try {
        await unidadeModel.associar(unidadeId, gestorId, trx);
      } catch (erro) {
        // Duas associações simultâneas do mesmo par
        if ((erro as { code?: string }).code === CHAVE_DUPLICADA) {
          throw new AppError(JA_ASSOCIADO, 409);
        }
        throw erro;
      }

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `ASSOCIOU_GESTOR_UNIDADE unidade=${unidade.nome} gestor=${gestorId}`,
          modulo: MODULOS_AUDITORIA.UNIDADES,
        },
        trx
      );

      return (await unidadeModel.buscarComGestores(unidadeId, trx)) as UnidadeComGestores;
    });
  },

  async removerGestor(unidadeId: number, gestorId: number, autorId: number): Promise<void> {
    await db.transaction(async (trx) => {
      const unidade = await unidadeModel.buscarPorId(unidadeId, trx);
      if (!unidade) {
        throw new AppError('Unidade não encontrada', 404);
      }

      if (!(await unidadeModel.desassociar(unidadeId, gestorId, trx))) {
        throw new AppError('Este gestor não está associado a esta unidade', 404);
      }

      await auditoriaModel.registrar(
        {
          usuario_id: autorId,
          acao: `REMOVEU_GESTOR_UNIDADE unidade=${unidade.nome} gestor=${gestorId}`,
          modulo: MODULOS_AUDITORIA.UNIDADES,
        },
        trx
      );
    });
  },
};
