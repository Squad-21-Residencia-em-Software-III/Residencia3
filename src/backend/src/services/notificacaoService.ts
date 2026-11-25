import { PERFIS, type Perfil } from '../constants/perfis';
import { UNIDADES } from '../constants/unidades';
import { AppError } from '../errors/AppError';
import {
  notificacaoModel,
  type EscopoNotificacoes,
  type Notificacao,
  type OperacaoNotificacao,
} from '../models/notificacaoModel';
import { unidadeModel } from '../models/unidadeModel';
import type { Usuario } from '../models/usuarioModel';
import type { ListarNotificacoes } from '../validators/notificacaoSchemas';

// Quem mudou de perfil não continua vendo avisos da operação anterior
const OPERACOES_POR_PERFIL: Record<Perfil, OperacaoNotificacao[]> = {
  ADMINISTRADOR: ['Administrativo', 'SVO'],
  SOLICITANTE: ['Administrativo'],
  GESTOR_FROTA: ['Administrativo'],
  // Administrativo: acompanha os próprios pedidos. SVO: só associado à unidade (ver escopoDo)
  GESTOR_SVO: ['Administrativo', 'SVO'],
  MOTORISTA_FROTA: ['Administrativo'],
  MOTORISTA_SVO: ['SVO'],
  INTEGRANTE_SVO: ['SVO'],
};

type Autor = Pick<Usuario, 'id' | 'perfil'>;

async function escopoDo({ id, perfil }: Autor): Promise<EscopoNotificacoes> {
  const associado = perfil !== PERFIS.GESTOR_SVO || (await unidadeModel.estaAssociadoPorNome(UNIDADES.SVO, id));
  return {
    usuarioId: id,
    operacoes: OPERACOES_POR_PERFIL[perfil].filter((operacao) => operacao !== 'SVO' || associado),
  };
}

const naoLidasDe = async (escopo: EscopoNotificacoes) => (await notificacaoModel.contarNaoLidas(escopo)).total;

export const notificacaoService = {
  async listar(
    autor: Autor,
    { limit, cursor, apenas_nao_lidas }: ListarNotificacoes
  ): Promise<{ itens: Notificacao[]; proximo_cursor: string | null; nao_lidas: number }> {
    const escopo = await escopoDo(autor);
    const [{ itens, proximo }, nao_lidas] = await Promise.all([
      notificacaoModel.listar(escopo, { limite: limit, cursor, apenasNaoLidas: apenas_nao_lidas }),
      naoLidasDe(escopo),
    ]);
    return { itens, proximo_cursor: proximo ? `${proximo.em}|${proximo.id}` : null, nao_lidas };
  },

  /** `versao` muda quando chega ou se lê um aviso, mesmo que o total continue igual. */
  async contador(autor: Autor): Promise<{ nao_lidas: number; versao: string }> {
    const { total, ultimoId } = await notificacaoModel.contarNaoLidas(await escopoDo(autor));
    return { nao_lidas: total, versao: `${ultimoId}-${total}` };
  },

  async marcarLida(autor: Autor, id: number): Promise<{ id: number; lida_em: Date; nao_lidas: number }> {
    const escopo = await escopoDo(autor);
    const marcada = await notificacaoModel.marcarLida(escopo, id);
    // A mesma resposta para inexistente e de outra pessoa
    if (!marcada) throw new AppError('Notificação não encontrada', 404);
    return { ...marcada, nao_lidas: await naoLidasDe(escopo) };
  },

  async marcarTodasLidas(autor: Autor, ateId?: number): Promise<{ atualizadas: number; nao_lidas: number }> {
    const escopo = await escopoDo(autor);
    const atualizadas = await notificacaoModel.marcarNaoLidas(escopo, { ateId });
    return { atualizadas, nao_lidas: await naoLidasDe(escopo) };
  },

  async marcarReferenciaLida(
    autor: Autor,
    tipo: string,
    id: number
  ): Promise<{ atualizadas: number; nao_lidas: number }> {
    const escopo = await escopoDo(autor);
    const atualizadas = await notificacaoModel.marcarNaoLidas(escopo, { referencia: { tipo, id } });
    return { atualizadas, nao_lidas: await naoLidasDe(escopo) };
  },
};
