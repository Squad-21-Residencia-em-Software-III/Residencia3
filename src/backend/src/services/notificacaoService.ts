import type { Knex } from 'knex';
import { PERFIS, type Perfil } from '../constants/perfis';
import {
  ACESSO_POR_PERFIL,
  type OperacaoNotificacao,
  type ReferenciaNotificacao,
} from '../constants/referenciasNotificacao';
import { UNIDADES } from '../constants/unidades';
import { AppError } from '../errors/AppError';
import { notificacaoModel, type EscopoNotificacoes, type Notificacao } from '../models/notificacaoModel';
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

interface Contador {
  nao_lidas: number;
  /** Muda quando chega ou se lê um aviso, mesmo que o total continue igual. */
  versao: string;
}

export type ItemNotificacao = Notificacao & { acesso_revogado: boolean };

export async function escopoDasNotificacoes({ id, perfil }: Autor, conexao?: Knex): Promise<EscopoNotificacoes> {
  const associado = perfil !== PERFIS.GESTOR_SVO || (await unidadeModel.estaAssociadoPorNome(UNIDADES.SVO, id, conexao));
  return {
    usuarioId: id,
    operacoes: OPERACOES_POR_PERFIL[perfil].filter((operacao) => operacao !== 'SVO' || associado),
    acesso: ACESSO_POR_PERFIL[perfil],
  };
}

async function contadorDe(escopo: EscopoNotificacoes): Promise<Contador> {
  const { total, soma } = await notificacaoModel.contarNaoLidas(escopo);
  return { nao_lidas: total, versao: `${total}-${soma}` };
}

/**
 * Quem perdeu o acesso ao registro sabe que houve um aviso (tipo, data e leitura), mas não o conteúdo. O título
 * também sai, porque pode citar o registro.
 */
function semConteudo(item: Notificacao): ItemNotificacao {
  return {
    ...item,
    titulo: 'Registro indisponível',
    mensagem: 'Você não tem mais acesso a este registro.',
    severidade: 'info',
    referencia_tipo: null,
    referencia_id: null,
    url_destino: '/',
    acesso_revogado: true,
  };
}

export const notificacaoService = {
  async listar(
    autor: Autor,
    { limit, cursor, apenas_nao_lidas }: ListarNotificacoes
  ): Promise<{ itens: ItemNotificacao[]; proximo_cursor: string | null } & Contador> {
    const escopo = await escopoDasNotificacoes(autor);
    const [{ itens, proximo }, contador] = await Promise.all([
      notificacaoModel.listar(escopo, { limite: limit, cursor, apenasNaoLidas: apenas_nao_lidas }),
      contadorDe(escopo),
    ]);
    return {
      itens: itens.map(({ tem_acesso, ...item }) => (tem_acesso ? { ...item, acesso_revogado: false } : semConteudo(item))),
      proximo_cursor: proximo ? `${proximo.em}|${proximo.id}` : null,
      ...contador,
    };
  },

  async contador(autor: Autor): Promise<Contador> {
    return contadorDe(await escopoDasNotificacoes(autor));
  },

  async marcarLida(autor: Autor, id: number): Promise<{ id: number; lida_em: Date } & Contador> {
    const escopo = await escopoDasNotificacoes(autor);
    const marcada = await notificacaoModel.marcarLida(escopo, id);
    // A mesma resposta para inexistente e de outra pessoa
    if (!marcada) throw new AppError('Notificação não encontrada', 404);
    return { ...marcada, ...(await contadorDe(escopo)) };
  },

  async marcarTodasLidas(autor: Autor, ids?: number[]): Promise<{ atualizadas: number } & Contador> {
    const escopo = await escopoDasNotificacoes(autor);
    const atualizadas = await notificacaoModel.marcarNaoLidas(escopo, { ids });
    return { atualizadas, ...(await contadorDe(escopo)) };
  },

  async marcarReferenciaLida(
    autor: Autor,
    tipo: ReferenciaNotificacao,
    id: number
  ): Promise<{ atualizadas: number } & Contador> {
    const escopo = await escopoDasNotificacoes(autor);
    const atualizadas = await notificacaoModel.marcarNaoLidas(escopo, { referencia: { tipo, id } });
    return { atualizadas, ...(await contadorDe(escopo)) };
  },
};
