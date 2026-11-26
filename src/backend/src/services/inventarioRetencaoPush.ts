import type { Knex } from 'knex';

interface PrazosSimulados {
  assinaturas: number;
  outbox: number;
}

interface Contagem {
  origem: 'assinaturas' | 'outbox';
  status: string;
  total: number;
  anterioresAoCorte: number;
}

export function lerPrazosSimulados(argumentos: string[]): PrazosSimulados {
  const valores = new Map<string, number>();
  for (const argumento of argumentos) {
    const partes = /^--(assinaturas|outbox)=(\d+)$/.exec(argumento);
    if (!partes || valores.has(partes[1])) {
      throw new Error('Informe cada prazo uma vez: --assinaturas=<dias> --outbox=<dias>.');
    }
    valores.set(partes[1], Number(partes[2]));
  }
  return { assinaturas: valores.get('assinaturas') ?? 0, outbox: valores.get('outbox') ?? 0 };
}

/** Apenas contagens por estado. Estar antes do corte não autoriza expurgo. */
export async function inventariarRetencaoPush(
  db: Knex,
  prazos: PrazosSimulados,
  agora = new Date(),
): Promise<{ observadoEm: string; prazosSimulados: PrazosSimulados; contagens: Contagem[] }> {
  for (const dias of [prazos.assinaturas, prazos.outbox]) {
    if (!Number.isSafeInteger(dias) || dias < 1) {
      throw new Error('Informe os dois prazos de simulação em dias inteiros positivos.');
    }
  }

  const observadoEm = agora.toISOString();
  const { rows } = await db.raw<{ rows: Array<Omit<Contagem, 'total' | 'anterioresAoCorte'> & {
    total: string;
    anteriores_ao_corte: string;
  }> }>(`
    SELECT 'assinaturas' AS origem, status, count(*) AS total,
      count(*) FILTER (
        WHERE NOT ativa AND status IN ('INVALIDA', 'REVOGADA', 'EXPIRADA')
          AND atualizado_em < ?::timestamptz - (? * interval '1 hour')
      ) AS anteriores_ao_corte
    FROM push_subscriptions
    GROUP BY status
    UNION ALL
    SELECT 'outbox' AS origem, status, count(*) AS total,
      count(*) FILTER (
        WHERE status IN ('ENVIADO', 'FALHA_DEFINITIVA', 'IGNORADO')
          AND processado_em < ?::timestamptz - (? * interval '1 hour')
      ) AS anteriores_ao_corte
    FROM notificacao_outbox
    GROUP BY status
    ORDER BY origem, status
  `, [observadoEm, prazos.assinaturas * 24, observadoEm, prazos.outbox * 24]);

  return {
    observadoEm,
    prazosSimulados: prazos,
    contagens: rows.map(({ origem, status, total, anteriores_ao_corte }) => ({
      origem, status, total: Number(total), anterioresAoCorte: Number(anteriores_ao_corte),
    })),
  };
}
