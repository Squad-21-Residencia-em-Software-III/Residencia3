import { db } from '../config/database';

export interface FiltrosIndicadores {
  // AAAA-MM-DD, inclusivos; ausentes deixam o lado do período aberto
  inicio?: string;
  fim?: string;
  // AAAA-MM-DD no horário de Brasília, referência para a CNH vencida
  hoje: string;
}

export interface Indicadores {
  solicitacoes_pendentes: number;
  viagens_em_andamento: number;
  veiculos_disponiveis: number;
  veiculos_disponiveis_administrativa: number;
  veiculos_disponiveis_svo: number;
  veiculos_em_manutencao: number;
  motoristas_cnh_vencida: number;
}

// Mesmo critério do período: a partir do início do dia inicial até o fim do dia final
const NO_PERIODO = (coluna: string) => `
  (CAST(? AS date) IS NULL OR ${coluna} >= CAST(? AS date))
  AND (CAST(? AS date) IS NULL OR ${coluna} < CAST(? AS date) + 1)
`;

export const dashboardModel = {
  async indicadores(filtros: FiltrosIndicadores): Promise<Indicadores> {
    const inicio = filtros.inicio ?? null;
    const fim = filtros.fim ?? null;
    const periodo = [inicio, inicio, fim, fim];

    const resultado = await db.raw<{ rows: Record<keyof Indicadores, string>[] }>(
      `
      SELECT
        s.solicitacoes_pendentes,
        vg.viagens_em_andamento,
        v.veiculos_disponiveis,
        v.veiculos_disponiveis_administrativa,
        v.veiculos_disponiveis_svo,
        v.veiculos_em_manutencao,
        m.motoristas_cnh_vencida
      FROM (
        SELECT COUNT(*) AS solicitacoes_pendentes
        FROM solicitacoes_viagem sv
        WHERE sv.status = 'PENDENTE_APROVACAO'
          AND ${NO_PERIODO('sv.data_saida_desejada')}
      ) s
      CROSS JOIN (
        SELECT COUNT(*) AS viagens_em_andamento
        FROM viagens_frota vf
        LEFT JOIN solicitacoes_viagem sv ON sv.id = vf.solicitacao_id
        WHERE vf.status = 'EM_ANDAMENTO'
          AND ${NO_PERIODO('COALESCE(vf.data_hora_efetiva_saida, sv.data_saida_desejada)')}
      ) vg
      CROSS JOIN (
        SELECT
          COUNT(*) FILTER (WHERE status = 'DISPONIVEL') AS veiculos_disponiveis,
          COUNT(*) FILTER (WHERE status = 'DISPONIVEL' AND tipo_frota = 'ADMINISTRATIVA') AS veiculos_disponiveis_administrativa,
          COUNT(*) FILTER (WHERE status = 'DISPONIVEL' AND tipo_frota = 'SVO') AS veiculos_disponiveis_svo,
          COUNT(*) FILTER (WHERE status = 'MANUTENCAO') AS veiculos_em_manutencao
        FROM veiculos
      ) v
      CROSS JOIN (
        SELECT COUNT(*) FILTER (WHERE validade_cnh < CAST(? AS date)) AS motoristas_cnh_vencida
        FROM motoristas
      ) m
      `,
      [...periodo, ...periodo, filtros.hoje]
    );

    // O pg devolve COUNT (bigint) como texto
    const linha = resultado.rows[0];
    return Object.fromEntries(
      Object.entries(linha ?? {}).map(([indicador, valor]) => [indicador, Number(valor ?? 0)])
    ) as unknown as Indicadores;
  },
};
