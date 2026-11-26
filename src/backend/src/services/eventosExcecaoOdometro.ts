import type { Knex } from 'knex';
import { PERFIS } from '../constants/perfis';

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
const CATEGORIA = 'ODOMETRO';

export function montarAvisoExcecaoSolicitada(
  excecaoId: number,
  fase: 'SAIDA' | 'CHEGADA' = 'SAIDA',
): AvisoExcecaoOdometro {
  return {
    tipo: 'EXCECAO_ODOMETRO_SOLICITADA',
    titulo: 'Exceção de odômetro solicitada',
    mensagem: `A exceção de odômetro nº ${excecaoId} aguarda análise.`,
    urlDestino: DESTINO,
    ocorrencia: `${fase}:${excecaoId}:solicitada`,
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
  decisao: 'APROVADA' | 'RECUSADA',
  fase: 'SAIDA' | 'CHEGADA' = 'SAIDA',
  justificativa?: string,
): AvisoExcecaoOdometro {
  const aprovada = decisao === 'APROVADA';
  const textoDecisao = `Seu pedido de exceção de odômetro nº ${excecaoId} foi ${aprovada ? 'aprovado' : 'recusado'}.`;

  return {
    tipo: 'EXCECAO_ODOMETRO_DECIDIDA',
    titulo: aprovada ? 'Exceção aprovada' : 'Exceção recusada',
    mensagem: [textoDecisao, justificativa?.trim() && ("Justificativa: " + justificativa.trim().replace(/\s+/g, ' '))]
      .filter(Boolean).join(' '),
    urlDestino: DESTINO,
    ocorrencia: `${fase}:${excecaoId}:${decisao.toLowerCase()}`,
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
export function destinatariosExcecaoOdometro(trx: Knex.Transaction): Promise<number[]> {
  return trx('usuarios').where({ ativo: true })
    .whereIn('perfil', [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA]).orderBy('id').pluck('id');
}
