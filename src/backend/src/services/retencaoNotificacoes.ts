import type { Knex } from 'knex';

// Política de retenção das notificações in-app (SCRUM-242):
// - lidas: removidas quando a leitura (lida_em) tem MAIS de 30 dias;
// - não lidas: removidas quando a criação (criado_em) tem MAIS de 90 dias.
// A comparação é estrita (">"): exatamente 30 (ou 90) dias ainda é mantida.
export const DIAS_RETENCAO_LIDAS = 30;
export const DIAS_RETENCAO_NAO_LIDAS = 90;

export const LIMITE_MAXIMO_LOTE = 500;
export const LOTES_MAXIMOS = 50;

export interface OpcoesLoteNotificacoes {
  aplicar: boolean;
  limite: number;
  /** Relógio injetável para testes determinísticos; em produção usa o horário atual. */
  agora?: Date;
}

export interface ResultadoLoteNotificacoes {
  candidatos: number;
  lidas: number;
  naoLidas: number;
  removidas: number;
  falhas: number;
}

// O corte usa horas fixas (e não "days") para não variar com horário de verão do fuso da sessão.
const SQL_ALVO = `
  SELECT id, (lida_em IS NOT NULL) AS lida
  FROM notificacoes
  WHERE (lida_em IS NOT NULL AND lida_em < ?::timestamptz - (? * interval '1 hour'))
     OR (lida_em IS NULL AND criado_em < ?::timestamptz - (? * interval '1 hour'))
  ORDER BY criado_em, id
  LIMIT ?
`;

function parametrosAlvo(agora: Date, limite: number) {
  return [
    agora.toISOString(), DIAS_RETENCAO_LIDAS * 24,
    agora.toISOString(), DIAS_RETENCAO_NAO_LIDAS * 24,
    limite,
  ];
}

function validarLimite(limite: number) {
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO_LOTE) {
    throw new Error(`O lote de retenção deve conter de 1 a ${LIMITE_MAXIMO_LOTE} notificações`);
  }
}

/**
 * Processa UM lote. Cada lote é um único comando SQL (atômico): se falhar, nada daquele lote é
 * removido e a próxima execução reprocessa os mesmos candidatos (idempotente).
 * No modo simulação apenas conta os candidatos, sem alterar o banco.
 */
export async function processarRetencaoNotificacoes(
  db: Knex | Knex.Transaction,
  opcoes: OpcoesLoteNotificacoes,
): Promise<ResultadoLoteNotificacoes> {
  validarLimite(opcoes.limite);
  const agora = opcoes.agora ?? new Date();
  const parametros = parametrosAlvo(agora, opcoes.limite);
  const resultado: ResultadoLoteNotificacoes = {
    candidatos: 0, lidas: 0, naoLidas: 0, removidas: 0, falhas: 0,
  };

  try {
    if (!opcoes.aplicar) {
      const { rows } = await db.raw(
        `WITH alvo AS (${SQL_ALVO})
         SELECT count(*) FILTER (WHERE lida) AS lidas, count(*) FILTER (WHERE NOT lida) AS nao_lidas FROM alvo`,
        parametros,
      );
      resultado.lidas = Number(rows[0].lidas);
      resultado.naoLidas = Number(rows[0].nao_lidas);
      resultado.candidatos = resultado.lidas + resultado.naoLidas;
      return resultado;
    }

    const { rows } = await db.raw(
      `WITH alvo AS (${SQL_ALVO}),
       removidas AS (
         DELETE FROM notificacoes n USING alvo WHERE n.id = alvo.id RETURNING alvo.lida
       )
       SELECT count(*) FILTER (WHERE lida) AS lidas, count(*) FILTER (WHERE NOT lida) AS nao_lidas FROM removidas`,
      parametros,
    );
    resultado.lidas = Number(rows[0].lidas);
    resultado.naoLidas = Number(rows[0].nao_lidas);
    resultado.removidas = resultado.lidas + resultado.naoLidas;
    resultado.candidatos = resultado.removidas;
  } catch {
    // Não repassa a mensagem original: ela poderia carregar detalhes de conexão ou de dados.
    resultado.falhas = 1;
  }
  return resultado;
}

export interface OpcoesRetencaoNotificacoes extends OpcoesLoteNotificacoes {
  lotes: number;
}

/**
 * Executa até `lotes` lotes em sequência. Para ao primeiro lote com falha, quando não há mais
 * candidatos ou quando o lote vem incompleto (acabaram os elegíveis).
 */
export async function executarRetencaoNotificacoes(
  db: Knex | Knex.Transaction,
  opcoes: OpcoesRetencaoNotificacoes,
): Promise<{ lotes: Array<ResultadoLoteNotificacoes & { lote: number }>; falhou: boolean }> {
  if (!Number.isInteger(opcoes.lotes) || opcoes.lotes < 1 || opcoes.lotes > LOTES_MAXIMOS) {
    throw new Error(`--lotes deve estar entre 1 e ${LOTES_MAXIMOS}`);
  }
  if (!opcoes.aplicar && opcoes.lotes > 1) {
    throw new Error('Múltiplos lotes exigem --aplicar (a simulação não remove nada e repetiria o mesmo lote).');
  }
  const agora = opcoes.agora ?? new Date();
  const resultados: Array<ResultadoLoteNotificacoes & { lote: number }> = [];
  let falhou = false;
  for (let lote = 1; lote <= opcoes.lotes; lote++) {
    const resultado = await processarRetencaoNotificacoes(db, {
      aplicar: opcoes.aplicar, limite: opcoes.limite, agora,
    });
    resultados.push({ lote, ...resultado });
    if (resultado.falhas > 0) { falhou = true; break; }
    if (resultado.candidatos < opcoes.limite) break;
    if (!opcoes.aplicar) break;
  }
  return { lotes: resultados, falhou };
}

/** Lê e valida os argumentos de linha de comando (rejeita qualquer argumento desconhecido). */
export function lerArgumentosRetencaoNotificacoes(argumentos: string[]) {
  if (argumentos.some((arg) => arg !== '--aplicar' && !/^--(limite|lotes)=\d+$/.test(arg))) {
    throw new Error(
      `Argumentos esperados: --aplicar, --limite=<1 a ${LIMITE_MAXIMO_LOTE}>, --lotes=<1 a ${LOTES_MAXIMOS}>`,
    );
  }
  const valor = (nome: string, padrao: number) => {
    const argumento = argumentos.find((arg) => arg.startsWith(`--${nome}=`));
    return argumento ? Number(argumento.split('=')[1]) : padrao;
  };
  const aplicar = argumentos.includes('--aplicar');
  const limite = valor('limite', 100);
  const lotes = valor('lotes', 1);
  if (limite < 1 || limite > LIMITE_MAXIMO_LOTE) {
    throw new Error(`--limite deve estar entre 1 e ${LIMITE_MAXIMO_LOTE}`);
  }
  if (lotes < 1 || lotes > LOTES_MAXIMOS) throw new Error(`--lotes deve estar entre 1 e ${LOTES_MAXIMOS}`);
  if (!aplicar && lotes > 1) throw new Error('--lotes maior que 1 exige --aplicar.');
  return { aplicar, limite, lotes };
}
