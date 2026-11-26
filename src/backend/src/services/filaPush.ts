import {
  notificacaoOutboxModel,
  type AssinaturaAtiva,
  type Conclusao,
  type FalhaEnvio,
  type ItemFilaPush,
  type PayloadPush,
} from '../models/notificacaoOutboxModel';

/** Um alerta atrasado demais confunde mais do que ajuda. O aviso continua no sistema. */
const HORAS_VALIDADE = 24;
const ITENS_POR_VEZ = 5;
const ITENS_POR_EXECUCAO = 200;
const LIMITE_ENVIO_MS = 10_000;
// Bem acima do tempo de um lote: os envios de um lote são simultâneos
const SEGUNDOS_RESERVA = 120;
const ESPERA_INICIAL_S = 30;
const ESPERA_MAXIMA_S = 3600;
const ESPERA_APOS_ERRO_MS = 5 * 60_000;
const INTERVALO_CARONA_MS = 60_000;

/**
 * Envio a um aparelho (SCRUM-237: web-push e VAPID). Responde o status HTTP do serviço de push; erro de
 * rede rejeita. `sinal` é cancelado quando o tempo acaba.
 */
export type EnviadorPush = (
  assinatura: AssinaturaAtiva,
  payload: PayloadPush,
  sinal: AbortSignal
) => Promise<{ status: number; retryAfterSegundos?: number }>;

interface ResultadoEnvio extends FalhaEnvio {
  assinatura: AssinaturaAtiva;
  tipo: 'sucesso' | 'expirada' | 'temporaria' | 'definitiva';
  retryAfterSegundos: number;
}

// Códigos fixos: nada de endpoint, usuário ou texto do aviso no log
function registrar(nivel: 'INFO' | 'ERROR', evento: string, dados: Record<string, number> = {}): void {
  const linha = JSON.stringify({ timestamp: new Date().toISOString(), level: nivel, evento, ...dados });
  if (nivel === 'ERROR') console.error(linha);
  else console.log(linha);
}

async function enviar(enviador: EnviadorPush, assinatura: AssinaturaAtiva, payload: PayloadPush): Promise<ResultadoEnvio> {
  const controle = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const prazo = new Promise<'TIMEOUT'>((resolve) => {
    timer = setTimeout(() => {
      resolve('TIMEOUT');
      controle.abort();
    }, LIMITE_ENVIO_MS);
  });
  try {
    const resposta = await Promise.race([enviador(assinatura, payload, controle.signal), prazo]);
    if (resposta === 'TIMEOUT') return { assinatura, tipo: 'temporaria', erro: 'TIMEOUT', statusHttp: null, retryAfterSegundos: 0 };
    const { status, retryAfterSegundos = 0 } = resposta;
    const tipo = status >= 200 && status < 300 ? 'sucesso'
      : status === 404 || status === 410 ? 'expirada'
      : status === 408 || status === 429 || status >= 500 ? 'temporaria'
      : 'definitiva';
    return { assinatura, tipo, erro: `HTTP_${status}`, statusHttp: status, retryAfterSegundos };
  } catch {
    return { assinatura, tipo: 'temporaria', erro: 'REDE', statusHttp: null, retryAfterSegundos: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function esperaDaTentativa(tentativa: number, retryAfterSegundos: number): number {
  // Variação de até 20%: muitos itens que falharam juntos não voltam todos no mesmo instante
  const crescente = ESPERA_INICIAL_S * 2 ** (tentativa - 1) * (1 + Math.random() * 0.2);
  return Math.min(ESPERA_MAXIMA_S, Math.ceil(Math.max(crescente, retryAfterSegundos)));
}

async function entregar(enviador: EnviadorPush, item: ItemFilaPush): Promise<Conclusao> {
  const destino = await notificacaoOutboxModel.destino(item);
  const { entregues: anteriores = [], definitivas: falharam = [], expiradas: invalidas = [], ...payload } = item.payload_push;
  if (typeof destino === 'string') {
    if (anteriores.length > 0) return { status: 'ENVIADO', parcial: true };
    if (falharam.length > 0) return { status: 'FALHA_DEFINITIVA', erro: 'APARELHOS_REJEITADOS', statusHttp: null };
    return { status: 'IGNORADO', erro: destino };
  }

  const concluidas = new Set([...anteriores, ...falharam, ...invalidas]);
  const pendentes = destino.filter(({ id }) => !concluidas.has(id));
  const resultados = await Promise.all(pendentes.map((assinatura) => enviar(enviador, assinatura, payload)));
  for (const { assinatura, tipo, statusHttp } of resultados) {
    const registro = tipo === 'sucesso' || tipo === 'expirada' ? tipo : 'falha';
    // O controle da assinatura não pode fazer o alerta já entregue ser enviado de novo
    await notificacaoOutboxModel.registrarEnvio(assinatura, registro, statusHttp)
      .catch(() => registrar('ERROR', 'PUSH_REGISTRO_ASSINATURA_FALHOU'));
  }

  const entregues = [...anteriores, ...resultados.filter((r) => r.tipo === 'sucesso').map((r) => r.assinatura.id)];
  const definitivas = [...falharam, ...resultados.filter((r) => r.tipo === 'definitiva').map((r) => r.assinatura.id)];
  const expiradas = [...invalidas, ...resultados.filter((r) => r.tipo === 'expirada').map((r) => r.assinatura.id)];
  const temporarias = resultados.filter((r) => r.tipo === 'temporaria');
  const [temporaria] = temporarias;
  if (temporaria && item.tentativas < item.max_tentativas) {
    const retryAfter = Math.max(...temporarias.map((r) => r.retryAfterSegundos));
    return {
      status: 'PENDENTE', entregues, definitivas, expiradas, erro: temporaria.erro, statusHttp: temporaria.statusHttp,
      esperaSegundos: esperaDaTentativa(item.tentativas, retryAfter),
    };
  }
  if (entregues.length > 0) {
    return { status: 'ENVIADO', parcial: definitivas.length + expiradas.length + temporarias.length > 0,
      entregues, definitivas: [...definitivas, ...temporarias.map((r) => r.assinatura.id)], expiradas };
  }
  const falha = temporaria ?? resultados.find((r) => r.tipo === 'definitiva');
  return falha
    ? { status: 'FALHA_DEFINITIVA', erro: falha.erro, statusHttp: falha.statusHttp }
    : definitivas.length > 0 ? { status: 'FALHA_DEFINITIVA', erro: 'APARELHOS_REJEITADOS', statusHttp: null }
    : { status: 'IGNORADO', erro: 'SEM_ASSINATURA' };
}

/** Uma passada pela fila. Pode rodar em mais de um processo ao mesmo tempo. */
export async function processarFilaPush(enviador: EnviadorPush): Promise<void> {
  const total = { vencidos: await notificacaoOutboxModel.encerrarVencidos(HORAS_VALIDADE), enviados: 0, parciais: 0, adiados: 0, ignorados: 0, falhas: 0 };
  for (let processados = 0; processados < ITENS_POR_EXECUCAO; processados += ITENS_POR_VEZ) {
    const itens = await notificacaoOutboxModel.reservar(ITENS_POR_VEZ, SEGUNDOS_RESERVA, HORAS_VALIDADE);
    if (itens.length === 0) break;
    await Promise.all(itens.map(async (item) => {
      try {
        const conclusao = await entregar(enviador, item);
        if (!(await notificacaoOutboxModel.concluir(item, conclusao))) return;
        if (conclusao.status === 'ENVIADO') total[conclusao.parcial ? 'parciais' : 'enviados'] += 1;
        else if (conclusao.status === 'PENDENTE') total.adiados += 1;
        else if (conclusao.status === 'IGNORADO') total.ignorados += 1;
        else total.falhas += 1;
      } catch {
        // A reserva vence sozinha e o item volta para a fila, sem derrubar os demais
        registrar('ERROR', 'PUSH_ITEM_INTERROMPIDO');
      }
    }));
  }
  if (Object.values(total).some((n) => n > 0)) registrar('INFO', 'PUSH_FILA_PROCESSADA', total);
}

// ---- Execução no servidor ----
// Sem varredura fixa, que manteria o banco acordado o tempo todo: a fila roda ao ligar o servidor (itens
// deixados por uma parada), depois do commit que criou um item, na hora da próxima tentativa e de carona
// numa requisição (itens criados por outro processo, como a rotina de expiração).

let enviadorAtual: EnviadorPush | null = null;
let rodando = false;
let rodarDeNovo = false;
let proximaExecucao: NodeJS.Timeout | undefined;
let ultimaCarona = 0;

function agendar(ms: number): void {
  clearTimeout(proximaExecucao);
  proximaExecucao = setTimeout(acordarFilaPush, Math.min(ms, ESPERA_MAXIMA_S * 1000));
  proximaExecucao.unref();
}

async function executar(enviador: EnviadorPush): Promise<void> {
  rodando = true;
  clearTimeout(proximaExecucao);
  try {
    await processarFilaPush(enviador);
    const espera = await notificacaoOutboxModel.esperaAteProximo();
    // Nunca menos de 1 s, para um item preso não virar um laço
    if (espera !== null) agendar(Math.max(1000, espera));
  } catch {
    registrar('ERROR', 'PUSH_FILA_FALHOU');
    agendar(ESPERA_APOS_ERRO_MS);
  } finally {
    rodando = false;
  }
  if (rodarDeNovo) {
    rodarDeNovo = false;
    acordarFilaPush();
  }
}

/** Não espera o envio nem falha: a operação que criou o aviso já terminou. */
export function acordarFilaPush(): void {
  if (!enviadorAtual) return;
  if (rodando) rodarDeNovo = true;
  else void executar(enviadorAtual);
}

/** Aproveita uma requisição, que já usa o banco. No máximo uma vez por minuto. */
export function acordarFilaPushDeCarona(): void {
  const agora = Date.now();
  if (!enviadorAtual || agora - ultimaCarona < INTERVALO_CARONA_MS) return;
  ultimaCarona = agora;
  acordarFilaPush();
}

/** Liga a fila e processa o que ficou pendente. Sem enviador, nada é processado e os avisos continuam no sistema. */
export function definirEnviadorPush(enviador: EnviadorPush | null): void {
  enviadorAtual = enviador;
  clearTimeout(proximaExecucao);
  acordarFilaPush();
}
