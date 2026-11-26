import type { Knex } from 'knex';
import { db } from '../config/database';
import { env } from '../config/env';
import { configNotificacoes } from '../config/notificacoes';

// Acompanhamento da liberação dos avisos (SCRUM-241, docs/scrum-241-implantacao-push.md). Só totais: nenhum
// usuário, endpoint, chave, texto de aviso ou registro de origem.

const JANELA_HORAS = 24;
// `ultimo_erro` da fila guarda códigos fixos (filaPush). Qualquer outro valor vira OUTRO, para nunca expor texto livre
const CODIGO = /^[A-Z][A-Z0-9_]{0,39}$/;

export interface MetricasNotificacoes {
  gerado_em: string;
  janela_horas: number;
  configuracao: { notificacoes_ativas: boolean; push_configurado: boolean };
  fila: {
    pendentes: number;
    processando: number;
    /** Há quanto tempo espera o item pendente mais antigo. `null` sem pendências. */
    pendente_mais_antigo_segundos: number | null;
    /** Encerrados dentro da janela, pelo resultado. */
    encerrados: { enviados: number; parciais: number; ignorados: number; falhas: number };
    /** Motivo dos ignorados e das falhas dentro da janela. */
    motivos: Record<string, number>;
  };
  aparelhos: { ativos: number; usuarios: number; expirados_na_janela: number };
  avisos: { criados_na_janela: number };
}

const numero = (valor: unknown): number => Number(valor ?? 0);

async function fila(conexao: Knex) {
  const { rows: [abertos] } = await conexao.raw<{ rows: Record<string, unknown>[] }>(
    `SELECT count(*) FILTER (WHERE status = 'PENDENTE') AS pendentes,
            count(*) FILTER (WHERE status = 'PROCESSANDO') AS processando,
            floor(extract(epoch FROM clock_timestamp() - min(criado_em) FILTER (WHERE status = 'PENDENTE'))) AS mais_antigo
       FROM notificacao_outbox WHERE status IN ('PENDENTE', 'PROCESSANDO')`
  );
  const { rows: encerrados } = await conexao.raw<{ rows: { status: string; ultimo_erro: string | null; total: string }[] }>(
    `SELECT status, ultimo_erro, count(*) AS total FROM notificacao_outbox
      WHERE status IN ('ENVIADO', 'IGNORADO', 'FALHA_DEFINITIVA')
        AND processado_em >= clock_timestamp() - ? * interval '1 hour'
      GROUP BY status, ultimo_erro`,
    [JANELA_HORAS]
  );

  const resumo = { enviados: 0, parciais: 0, ignorados: 0, falhas: 0 };
  const motivos: Record<string, number> = {};
  for (const { status, ultimo_erro, total } of encerrados) {
    const quantidade = numero(total);
    if (status === 'ENVIADO') {
      if (ultimo_erro === 'ENTREGA_PARCIAL') resumo.parciais += quantidade;
      else resumo.enviados += quantidade;
      continue;
    }
    if (status === 'IGNORADO') resumo.ignorados += quantidade;
    else resumo.falhas += quantidade;
    const motivo = ultimo_erro && CODIGO.test(ultimo_erro) ? ultimo_erro : 'OUTRO';
    motivos[motivo] = (motivos[motivo] ?? 0) + quantidade;
  }

  const maisAntigo = abertos?.mais_antigo;
  return {
    pendentes: numero(abertos?.pendentes),
    processando: numero(abertos?.processando),
    pendente_mais_antigo_segundos: maisAntigo === null || maisAntigo === undefined ? null : numero(maisAntigo),
    encerrados: resumo,
    motivos,
  };
}

async function aparelhos(conexao: Knex) {
  const { rows: [linha] } = await conexao.raw<{ rows: Record<string, unknown>[] }>(
    `SELECT count(*) FILTER (WHERE ativa) AS ativos,
            count(DISTINCT usuario_id) FILTER (WHERE ativa) AS usuarios,
            count(*) FILTER (WHERE expirada_em >= clock_timestamp() - ? * interval '1 hour') AS expirados
       FROM push_subscriptions`,
    [JANELA_HORAS]
  );
  return { ativos: numero(linha?.ativos), usuarios: numero(linha?.usuarios), expirados_na_janela: numero(linha?.expirados) };
}

async function avisos(conexao: Knex) {
  const { rows: [linha] } = await conexao.raw<{ rows: Record<string, unknown>[] }>(
    `SELECT count(*) AS criados FROM notificacoes WHERE criado_em >= clock_timestamp() - ? * interval '1 hour'`,
    [JANELA_HORAS]
  );
  return { criados_na_janela: numero(linha?.criados) };
}

export const metricasNotificacoes = {
  async obter(conexao: Knex = db): Promise<MetricasNotificacoes> {
    const [resumoFila, resumoAparelhos, resumoAvisos] = await Promise.all([fila(conexao), aparelhos(conexao), avisos(conexao)]);
    return {
      gerado_em: new Date().toISOString(),
      janela_horas: JANELA_HORAS,
      configuracao: { notificacoes_ativas: configNotificacoes.ativas, push_configurado: env.webPush !== null },
      fila: resumoFila,
      aparelhos: resumoAparelhos,
      avisos: resumoAvisos,
    };
  },
};
