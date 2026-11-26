// A mesma reserva em disponibilidade, agenda e listagens. A viagem sem período próprio é legada:
// a solicitação continua sendo a fonte de fallback, sem fabricar datas históricas na migration.
// Os aliases vf e sv são os da viagem administrativa e de sua solicitação.
export const INICIO_PLANEJADO_SQL = 'COALESCE(vf.inicio_previsto, sv.data_saida_desejada)';
export const FIM_PLANEJADO_SQL = `COALESCE(vf.fim_previsto, sv.data_chegada_desejada,
  (date_trunc('day', sv.data_saida_desejada AT TIME ZONE 'America/Sao_Paulo') + interval '1 day')
    AT TIME ZONE 'America/Sao_Paulo'
)`;
