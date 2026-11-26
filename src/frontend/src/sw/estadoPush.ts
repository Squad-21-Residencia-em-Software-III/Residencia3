import { vinculoValido } from './logicaPushSw';
import { sincronizarAppBadge } from '../utils/appBadging';
import {
  concluirBarreira, encerramentoPendenteEmMemoria, iniciarBarreira, lerBarreira,
  novoPedidoSuspensao, suspenderBarreira,
} from './barreiraPush';

interface EstadoPush {
  geracao: string;
  vinculo: string | null;
  encerramento: boolean;
  recentes: number[];
  badge?: number;
  badgeConsultadoEm?: number;
}

const INICIAL: EstadoPush = { geracao: 'inicial', vinculo: null, encerramento: false, recentes: [] };
const BANCO = 'fsph-push';
const CHAVE = 'dispositivo';
let conexao: Promise<IDBDatabase> | undefined;

function abrir(): Promise<IDBDatabase> {
  conexao ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(BANCO);
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        conexao = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Armazenamento de alertas indisponível'));
  }).catch((erro) => {
    conexao = undefined;
    throw erro;
  });
  return conexao;
}

async function estado(alterar?: (atual: EstadoPush) => EstadoPush): Promise<EstadoPush> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const trx = db.transaction(BANCO, alterar ? 'readwrite' : 'readonly');
    const store = trx.objectStore(BANCO);
    const req = store.get(CHAVE);
    let valor = INICIAL;
    trx.oncomplete = () => resolve(valor);
    trx.onabort = () => reject(trx.error ?? new Error('Transação de alertas abortada.'));
    req.onerror = () => reject(req.error ?? new Error('Falha na leitura de alertas.'));
    req.onsuccess = () => {
      try {
        const atual: EstadoPush = req.result ?? INICIAL;
        valor = alterar ? alterar(atual) : atual;
        if (valor !== atual) store.put(valor, CHAVE);
      } catch (erro) {
        // Uma exceção síncrona no callback (ex.: put/clone/estado da
        // transação) não pode deixar a promessa aguardando indefinidamente.
        try { trx.abort(); } catch { /* A transação pode já estar encerrada. */ }
        reject(erro);
      }
    };
  });
}

/** Serializa os efeitos visíveis e o encerramento em todas as abas e no SW. */
export function comTravaDeApresentacao<T>(acao: () => Promise<T>): Promise<T | undefined> {
  if (!globalThis.indexedDB || !navigator.locks) return Promise.resolve(undefined);
  return navigator.locks.request('fsph-apresentacao-push', { signal: AbortSignal.timeout(3000) }, acao).catch(() => undefined);
}

export async function lerEstadoPush(): Promise<EstadoPush | null> {
  const [atual, barreira] = await Promise.all([estado().catch(() => null), lerBarreira()]);
  if (!atual) return null;
  const encerramento = atual.encerramento || barreira?.encerramento === true || encerramentoPendenteEmMemoria();
  if (!barreira || encerramento || atual.geracao !== barreira.geracao) {
    return { ...atual, vinculo: null, encerramento };
  }
  return atual;
}

/** Antes da prova autenticada, prepara a geração das duas armazenagens. */
export async function prepararEstadoPush(): Promise<EstadoPush | null> {
  const preparado = await comTravaDeApresentacao(async () => {
    const atual = await estado();
    if (atual.encerramento || encerramentoPendenteEmMemoria()) return null;
    let barreira = await iniciarBarreira();
    if (!barreira && !encerramentoPendenteEmMemoria()) {
      // Uma rotação não manual pode ter falhado. Preparar outra geração antes
      // da prova autenticada, jamais reutilizar um vínculo de geração incerta.
      await suspenderBarreira(novoPedidoSuspensao(false));
      barreira = await lerBarreira();
    }
    if (!barreira || barreira.encerramento || encerramentoPendenteEmMemoria()) return null;
    if (atual.geracao !== barreira.geracao) {
      await estado((a) => a.encerramento ? a : { ...INICIAL, geracao: barreira.geracao });
    }
    const novo = await lerEstadoPush();
    return novo?.geracao === barreira.geracao && !novo.encerramento ? novo : null;
  });
  return preparado ?? null;
}

export async function registrarVinculo(geracao: string | undefined, vinculo: unknown, sinal: AbortSignal): Promise<boolean> {
  if (!geracao || !vinculoValido(vinculo) || sinal.aborted) return false;
  return (await comTravaDeApresentacao(async () => {
    const barreira = await lerBarreira();
    if (barreira?.geracao !== geracao || barreira.encerramento || sinal.aborted) return false;
    await estado((atual) => atual.geracao === geracao && !atual.encerramento && !sinal.aborted && atual.vinculo !== vinculo
      ? { ...atual, vinculo, recentes: [], badge: undefined, badgeConsultadoEm: undefined }
      : atual);
    const atual = await lerEstadoPush();
    return !sinal.aborted && atual?.geracao === geracao && atual.vinculo === vinculo && !atual.encerramento;
  })) === true;
}

export async function suspenderApresentacao(encerramento: boolean) {
  const pedido = novoPedidoSuspensao(encerramento);
  // Entrega ao SW antes de depender de qualquer operação assíncrona da aba.
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.controller?.postMessage(pedido); } catch { /* Persistências independentes abaixo. */ }
  }
  const invalidar = estado((atual) => ({
    ...INICIAL, geracao: pedido.geracao, encerramento: encerramento || atual.encerramento,
  }));
  const marcador = suspenderBarreira(pedido);
  const limpar = async () => {
    await sincronizarAppBadge(0);
    if ('serviceWorker' in navigator) {
      const registro = await navigator.serviceWorker.getRegistration();
      (await registro?.getNotifications())?.forEach((aviso) => aviso.close());
    }
  };
  // Nenhuma falha de uma persistência impede a outra ou a limpeza visual.
  await Promise.allSettled([invalidar, marcador, limpar()]);
}

export async function confirmarEncerramento(): Promise<boolean> {
  // Chamado dentro do lock da assinatura, depois de remover a assinatura antiga.
  return (await comTravaDeApresentacao(async () => {
    let barreira = await lerBarreira() ?? await iniciarBarreira();
    if (!barreira) {
      // A remoção da assinatura já ocorreu. Repetir a marca antes de liberar.
      await suspenderBarreira(novoPedidoSuspensao(true));
      barreira = await lerBarreira();
    }
    if (!barreira) return false;
    const geracao = crypto.randomUUID();
    await estado(() => ({ ...INICIAL, geracao }));
    if (!(await concluirBarreira(barreira.geracao, geracao))) return false;
    const atual = await lerEstadoPush();
    return atual?.geracao === geracao && !atual.encerramento && atual.vinculo === null;
  })) === true;
}

export function resetarBadgePush() {
  return estado((atual) => atual.badge === undefined ? atual : { ...atual, badge: undefined });
}

export function registrarRecebimento(geracao: string, id: number) {
  return estado((atual) => atual.geracao === geracao
    ? { ...atual, recentes: [...atual.recentes.slice(-127), id], badge: undefined }
    : atual);
}

export async function atualizarBadgeDoVinculo(
  anterior: EstadoPush, elegiveis: number, valido: () => boolean, iniciadoEm: number,
) {
  if (!Number.isSafeInteger(elegiveis) || elegiveis < 0) return;
  await comTravaDeApresentacao(async () => {
    const atual = await lerEstadoPush();
    if (!atual || atual.encerramento || !valido() || atual.geracao !== anterior.geracao || !atual.vinculo ||
        atual.vinculo !== anterior.vinculo || atual.recentes.at(-1) !== anterior.recentes.at(-1) ||
        iniciadoEm <= (atual.badgeConsultadoEm ?? 0)) return;
    if (atual.badge !== elegiveis) await sincronizarAppBadge(elegiveis);
    await estado((a) => a.geracao === atual.geracao && a.vinculo === atual.vinculo
      ? { ...a, badge: elegiveis, badgeConsultadoEm: iniciadoEm }
      : a);
  });
}
