export interface AvisoExcecaoOdometro {
  tipo: string;
  titulo: string;
  mensagem: string;
  urlDestino: string;
  ocorrencia: string;
  push: {
    categoria: string;
    titulo: string;
    corpo: string;
    tag: string;
  };
}

const DESTINO = '/viagens';
const CATEGORIA = 'VIAGENS';

export function montarAvisoExcecaoSolicitada(
  excecaoId: number
): AvisoExcecaoOdometro {
  return {
    tipo: 'EXCECAO_ODOMETRO_SOLICITADA',
    titulo: 'Exceção de odômetro solicitada',
    mensagem: `A exceção de odômetro nº ${excecaoId} aguarda análise.`,
    urlDestino: DESTINO,
    ocorrencia: 'solicitada',
    push: {
      categoria: CATEGORIA,
      titulo: 'Exceção de odômetro',
      corpo: 'Um pedido de exceção aguarda análise.',
      tag: `excecao-odometro-${excecaoId}`,
    },
  };
}

export function montarAvisoExcecaoDecidida(
  excecaoId: number,
  decisao: 'APROVADA' | 'RECUSADA'
): AvisoExcecaoOdometro {
  const aprovada = decisao === 'APROVADA';

  return {
    tipo: 'EXCECAO_ODOMETRO_DECIDIDA',
    titulo: aprovada ? 'Exceção aprovada' : 'Exceção recusada',
    mensagem: `Seu pedido de exceção de odômetro nº ${excecaoId} foi ${aprovada ? 'aprovado' : 'recusado'}.`,
    urlDestino: DESTINO,
    ocorrencia: decisao.toLowerCase(),
    push: {
      categoria: CATEGORIA,
      titulo: 'Decisão de exceção',
      corpo: aprovada
        ? 'Seu pedido de exceção foi aprovado.'
        : 'Seu pedido de exceção foi recusado.',
      tag: `excecao-odometro-${excecaoId}`,
    },
  };
}
import type { Knex } from 'knex';
import { PERFIS } from '../constants/perfis';
import { UNIDADES } from '../constants/unidades';

export async function destinatariosExcecaoOdometro(
  trx: Knex.Transaction,
  tipo: 'ADMINISTRATIVA' | 'SVO'
): Promise<number[]> {
  const administradores = await trx('usuarios')
    .where({ perfil: PERFIS.ADMINISTRADOR, ativo: true })
    .pluck('id');

  if (tipo === 'ADMINISTRATIVA') {
    const gestores = await trx('usuarios')
      .where({ perfil: PERFIS.GESTOR_FROTA, ativo: true })
      .pluck('id');

    return [...new Set([...administradores, ...gestores])];
  }

  const gestoresSvo = await trx('usuarios as u')
    .join('gestores_unidades as gu', 'gu.usuario_id', 'u.id')
    .join('unidades as unidade', 'unidade.id', 'gu.unidade_id')
    .where({
      'u.perfil': PERFIS.GESTOR_SVO,
      'u.ativo': true,
      'unidade.nome': UNIDADES.SVO,
    })
    .distinct()
    .pluck('u.id');

  return [...new Set([...administradores, ...gestoresSvo])];
}