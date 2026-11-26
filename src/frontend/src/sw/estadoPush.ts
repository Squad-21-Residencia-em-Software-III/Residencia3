import { vinculoValido } from './logicaPushSw';
import { sincronizarAppBadge } from '../utils/appBadging';

interface EstadoPush {
  geracao: string;
  vinculo: string | null;
  encerramento: boolean;
  recentes: number[];
  badge?: number;
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
    req.onsuccess = () => {
      const atual: EstadoPush = req.result ?? INICIAL;
      valor = alterar ? alterar(atual) : atual;
      if (valor !== atual) store.put(valor, CHAVE);
    };
    trx.oncomplete = () => resolve(valor);
    trx.onabort = () => reject(trx.error);
  });
}

/** Serializa os efeitos visíveis e o encerramento em todas as abas e no SW. */
export function comTravaDeApresentacao<T>(acao: () => Promise<T>): Promise<T | undefined> {
  if (!globalThis.indexedDB || !navigator.locks) return Promise.resolve(undefined);
  return navigator.locks.request('fsph-apresentacao-push', acao).catch(() => undefined);
}

export async function lerEstadoPush(): Promise<EstadoPush | null> {
  return estado().catch(() => null);
}

export async function registrarVinculo(geracao: string | undefined, vinculo: unknown, sinal: AbortSignal) {
  if (!geracao || !vinculoValido(vinculo) || sinal.aborted) return;
  await comTravaDeApresentacao(() => estado((atual) =>
    atual.geracao === geracao && !atual.encerramento && !sinal.aborted && atual.vinculo !== vinculo
      ? { ...atual, vinculo, recentes: [], badge: undefined }
      : atual));
}

export async function suspenderApresentacao(encerramento: boolean) {
  await comTravaDeApresentacao(async () => {
    await estado((atual) => ({
      ...INICIAL, geracao: crypto.randomUUID(), encerramento: encerramento || atual.encerramento,
    }));
    await sincronizarAppBadge(0);
    if ('serviceWorker' in navigator) {
      const registro = await navigator.serviceWorker.getRegistration();
      const notificacoes = await registro?.getNotifications();
      notificacoes?.forEach((aviso) => aviso.close());
    }
  });
}

export async function confirmarEncerramento() {
  // Chamado dentro do lock da assinatura, depois de remover a assinatura antiga do navegador.
  await comTravaDeApresentacao(() => estado((atual) =>
    atual.encerramento ? { ...atual, encerramento: false } : atual));
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
  anterior: EstadoPush, elegiveis: number, valido: () => boolean,
) {
  if (!Number.isSafeInteger(elegiveis) || elegiveis < 0) return;
  await comTravaDeApresentacao(async () => {
    const atual = await estado();
    if (!valido() || atual.geracao !== anterior.geracao || !atual.vinculo ||
        atual.vinculo !== anterior.vinculo || atual.recentes.at(-1) !== anterior.recentes.at(-1) ||
        atual.badge === elegiveis) return;
    await sincronizarAppBadge(elegiveis);
    await estado((a) => ({ ...a, badge: elegiveis }));
  });
}
