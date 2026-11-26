/**
 * Marcador local redundante (CacheStorage), separado do IndexedDB. Não contém
 * token, endpoint, usuário, vínculo, nem conteúdo de notificação.
 */
export interface BarreiraPush {
  geracao: string;
  encerramento: boolean;
}

export interface SuspensaoPush extends BarreiraPush {
  tipo: 'SUSPENDER_APRESENTACAO_PUSH';
  anterior: string | null;
}

const CACHE = 'fsph-push-barreira-v1';
const TRAVA = 'fsph-push-barreira-v1';
const chave = () => new URL('/__fsph_push_barreira_v1__', globalThis.location.origin).href;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let ultima: string | null = null;
let bloqueio: SuspensaoPush | null = null;
const pendentes = new Set<string>();

export function interpretarSuspensao(dados: unknown): SuspensaoPush | null {
  if (!dados || typeof dados !== 'object') return null;
  const d = dados as Partial<SuspensaoPush>;
  if (d.tipo !== 'SUSPENDER_APRESENTACAO_PUSH' || typeof d.geracao !== 'string' || !uuid.test(d.geracao) ||
      typeof d.encerramento !== 'boolean' || !(d.anterior === null || (typeof d.anterior === 'string' && uuid.test(d.anterior)))) return null;
  return { tipo: d.tipo, geracao: d.geracao, encerramento: d.encerramento, anterior: d.anterior };
}

async function lerRegistro(): Promise<BarreiraPush | null> {
  const resposta = await (await caches.open(CACHE)).match(chave());
  if (!resposta) return null;
  const registro = await resposta.json() as Partial<BarreiraPush> | null;
  if (!registro || typeof registro.geracao !== 'string' || !uuid.test(registro.geracao) || typeof registro.encerramento !== 'boolean') {
    throw new Error('Marcador de apresentação inválido.');
  }
  return { geracao: registro.geracao, encerramento: registro.encerramento };
}

async function gravar(registro: BarreiraPush): Promise<void> {
  await (await caches.open(CACHE)).put(chave(), new Response(JSON.stringify(registro), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

export function novoPedidoSuspensao(encerramento: boolean): SuspensaoPush {
  return { tipo: 'SUSPENDER_APRESENTACAO_PUSH', anterior: ultima, geracao: crypto.randomUUID(), encerramento };
}

export function encerramentoPendenteEmMemoria(): boolean {
  return bloqueio?.encerramento === true;
}

/** Ausência, falha e divergência não são autorização. */
export async function lerBarreira(): Promise<BarreiraPush | null> {
  try {
    const registro = await lerRegistro();
    if (!registro || pendentes.size > 0) return null;
    if (bloqueio) {
      if (registro.geracao === bloqueio.geracao || (bloqueio.anterior !== null && registro.geracao !== bloqueio.anterior)) {
        bloqueio = null;
      } else return null;
    }
    ultima = registro.geracao;
    return registro;
  } catch {
    return null;
  }
}

/** Trava própria: a suspensão não espera por Toast, rede ou pela trava de apresentação. */
async function comTrava<T>(acao: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('Web Locks indisponível.');
  return navigator.locks.request(TRAVA, { signal: AbortSignal.timeout(2000) }, acao);
}

/**
 * Bloqueia imediatamente neste contexto, antes da primeira espera. Mensagem
 * atrasada conhecida não pode sobrescrever um marcador de geração posterior.
 * Mensagem sem geração anterior só suspende a apresentação (não encerra uma
 * assinatura possivelmente nova). A aba autora registra o encerramento real.
 */
export async function suspenderBarreira(pedido: SuspensaoPush, viaMensagem = false): Promise<boolean> {
  const anterior = pedido.anterior ?? ultima;
  const manual = pedido.encerramento && (!viaMensagem || pedido.anterior !== null);
  const manualPendente = manual || encerramentoPendenteEmMemoria();
  bloqueio = { ...pedido, anterior, encerramento: manualPendente };
  pendentes.add(pedido.geracao);
  try {
    const aplicado = await comTrava(async () => {
      const atual = await lerRegistro();
      if (atual?.geracao === pedido.geracao) return false;
      if (viaMensagem && pedido.anterior !== null && atual && atual.geracao !== pedido.anterior) return false;
      await gravar({ geracao: pedido.geracao, encerramento: manualPendente || atual?.encerramento === true });
      return true;
    });
    if (bloqueio?.geracao === pedido.geracao) bloqueio = null;
    return aplicado;
  } catch {
    // Se a gravação falhou, o bloqueio em memória continua valendo neste contexto.
    return false;
  } finally {
    pendentes.delete(pedido.geracao);
  }
}

/**
 * Inicialização (inclui atualização de versões anteriores). Nunca troca um
 * marcador existente ou remove encerramento pendente. O registro no servidor
 * ainda precisa ser consultado depois, com a geração devolvida.
 */
export async function iniciarBarreira(): Promise<BarreiraPush | null> {
  if (bloqueio || pendentes.size) return null;
  try {
    await comTrava(async () => {
      if (!(await lerRegistro())) await gravar({ geracao: crypto.randomUUID(), encerramento: false });
    });
    return lerBarreira();
  } catch {
    return null;
  }
}

/** Só após o encerramento da assinatura antiga, sob a fila de assinaturas. */
export async function concluirBarreira(anterior: string, nova: string): Promise<boolean> {
  try {
    const feito = await comTrava(async () => {
      const atual = await lerRegistro();
      if (atual?.geracao !== anterior) return false;
      await gravar({ geracao: nova, encerramento: false });
      return true;
    });
    if (feito) bloqueio = null;
    return feito;
  } catch {
    return false;
  }
}
