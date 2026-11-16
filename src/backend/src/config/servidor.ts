import type { Server } from 'node:http';
import { env } from './env';

// Tempos do servidor HTTP do Node (docs/limites-e-timeouts.md)
export const TEMPO_CABECALHOS_MS = 20_000;
export const TEMPO_KEEP_ALIVE_MS = 5_000;

export function configurarServidor(servidor: Server, tempoRequisicaoMs = env.requestTimeoutMs): Server {
  // Margem sobre o timeout da aplicação, que responde 503 antes de a conexão ser derrubada
  servidor.requestTimeout = tempoRequisicaoMs + 5_000;
  // Conexões que demoram a enviar os cabeçalhos (slowloris) são encerradas
  servidor.headersTimeout = TEMPO_CABECALHOS_MS;
  servidor.keepAliveTimeout = TEMPO_KEEP_ALIVE_MS;
  return servidor;
}
