import { vi } from 'vitest';

// Fixtures dos testes de orquestração: o código de estado/barreira continua real.
export const VINCULO_TESTE = 'A'.repeat(43);
let registro: unknown;
let marcador: unknown;
const clone = (d: unknown): unknown => d === undefined ? undefined : JSON.parse(JSON.stringify(d));
let filaIdb: Promise<unknown> = Promise.resolve();
export function instalarArmazenamentoPushTeste() {
  registro = undefined;
  marcador = undefined;
  filaIdb = Promise.resolve();
  vi.stubGlobal('indexedDB', { open: () => {
    const banco = {
      transaction: () => {
        let novo: unknown;
        const trx = { oncomplete: () => {}, onabort: () => {}, objectStore: () => ({
          get: () => {
            const req = { result: undefined as unknown, onsuccess: () => {} };
            filaIdb = filaIdb.then(() => {
              req.result = clone(registro);
              req.onsuccess();
              if (novo !== undefined) registro = clone(novo);
              trx.oncomplete();
            });
            return req;
          },
          put: (valor: unknown) => { novo = clone(valor); },
        }) };
        return trx;
      }, close: () => {}, onversionchange: () => {},
    };
    const req = { result: banco, onsuccess: () => {}, onerror: () => {}, onblocked: () => {} };
    queueMicrotask(() => req.onsuccess());
    return req;
  } });
  vi.stubGlobal('caches', { open: async () => ({
    match: async () => marcador === undefined ? undefined : new Response(JSON.stringify(marcador)),
    put: async (_url: string, resposta: Response) => { marcador = await resposta.json(); },
  }) });
}

export function criarTravasPushTeste(observar: (nome: string) => void = () => {}) {
  const filas = new Map<string, Promise<unknown>>();
  return { request: (nome: string, opcoes: unknown, callback?: () => Promise<unknown>) => {
    observar(nome);
    const acao = typeof opcoes === 'function' ? opcoes as () => Promise<unknown> : callback;
    if (!acao) throw new Error('Callback da trava ausente.');
    const resultado = (filas.get(nome) ?? Promise.resolve()).then(acao);
    filas.set(nome, resultado.catch(() => undefined));
    return resultado;
  } };
}
