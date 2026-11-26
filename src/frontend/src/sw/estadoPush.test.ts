import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const vinculo = 'A'.repeat(43);
interface Registro { geracao: string; vinculo: string | null; encerramento: boolean; recentes: number[] }
interface Marcador { geracao: string; encerramento: boolean }
const clone = <T,>(d: T): T => JSON.parse(JSON.stringify(d));

// O cache guarda JSON, não um stream de rede. O dublê evita depender do
// agendamento de ReadableStream/undici para concluir a leitura do marcador.
class RespostaCacheTeste {
  constructor(private readonly corpo: string) {}
  async json() { return JSON.parse(this.corpo); }
}

function prepararArmazenagens() {
  // Cada caso tem seu próprio armazenamento. Uma operação atrasada do caso
  // anterior não pode ler nem escrever os registros/flags deste caso.
  const dados = {
    registro: { geracao: A, vinculo, encerramento: false, recentes: [] } as Registro,
    marcador: { geracao: A, encerramento: false } as Marcador | null,
    falharIdb: false, falharPutSincrono: false, falharCache: false, falharLeituraCache: false,
  };
  let fila: Promise<void> = Promise.resolve();
  const banco = {
    transaction: () => {
      let abortado = false;
      let novo: Registro | undefined;
      const trx = {
        oncomplete: () => {}, onabort: () => {}, error: new Error('IDB abortado'),
        abort: () => { abortado = true; },
        objectStore: () => ({
          get: () => {
            const req = { result: undefined as Registro | undefined, onsuccess: () => {} };
            // Serialização e leitura no início da transação, não no momento
            // em que get é agendado. Sem timers nem callbacks de outro caso.
            fila = fila.then(() => {
              req.result = clone(dados.registro);
              req.onsuccess();
              if (abortado) trx.onabort();
              else { if (novo) dados.registro = clone(novo); trx.oncomplete(); }
            });
            return req;
          },
          put: (valor: Registro) => {
            if (dados.falharPutSincrono) throw new Error('put síncrono falhou');
            if (dados.falharIdb) abortado = true;
            else novo = clone(valor);
          },
        }),
      };
      return trx;
    },
    close: () => {}, onversionchange: () => {},
  };
  vi.stubGlobal('indexedDB', { open: () => {
    const req = { result: banco, onsuccess: () => {}, onupgradeneeded: () => {}, onerror: () => {}, onblocked: () => {} };
    void Promise.resolve().then(() => req.onsuccess());
    return req;
  } });
  vi.stubGlobal('Response', RespostaCacheTeste);
  vi.stubGlobal('caches', { open: async () => ({
    match: async () => {
      if (dados.falharLeituraCache) throw new Error('cache indisponível');
      return dados.marcador ? new RespostaCacheTeste(JSON.stringify(dados.marcador)) : undefined;
    },
    put: async (_key: string, resposta: RespostaCacheTeste) => {
      if (dados.falharCache) throw new Error('falha na gravação do cache');
      dados.marcador = clone(await resposta.json());
    },
  }) });
  const avisos = vi.fn();
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, acao: () => Promise<unknown>) => acao() },
    serviceWorker: { controller: { postMessage: avisos }, getRegistration: async () => ({ getNotifications: async () => [] }) },
  });
  return { dados, avisos };
}

let ambiente: ReturnType<typeof prepararArmazenagens>;
let aba: typeof import('./estadoPush');
let worker: typeof import('./estadoPush');
beforeEach(async () => {
  vi.useRealTimers();
  ambiente = prepararArmazenagens();
  // Carrega os dois contextos antes de começar a medir o teste. O segundo
  // tem memória independente, como um SW reiniciado, e compartilha só o disco.
  vi.resetModules();
  aba = await import('./estadoPush');
  vi.resetModules();
  worker = await import('./estadoPush');
});
afterEach(() => vi.unstubAllGlobals());

describe('estado Push exige duas gerações coerentes', () => {
  it('falha de gravação IndexedDB não permite apresentar vínculo antigo após reinício', async () => {
    const { dados, avisos } = ambiente;
    expect((await aba.lerEstadoPush())?.vinculo).toBe(vinculo);
    dados.falharIdb = true;
    const sair = aba.suspenderApresentacao(true);
    expect(avisos).toHaveBeenCalledOnce();
    await sair;
    expect(dados.registro.vinculo).toBe(vinculo);
    expect(dados.marcador?.geracao).not.toBe(A);
    expect((await worker.lerEstadoPush())?.vinculo).toBeNull();
    expect((await worker.lerEstadoPush())?.encerramento).toBe(true);
    expect(await worker.registrarVinculo(A, vinculo, new AbortController().signal)).toBe(false);
  });
  it('falha do CacheStorage não impede invalidação no IndexedDB', async () => {
    const { dados } = ambiente;
    expect((await aba.lerEstadoPush())?.vinculo).toBe(vinculo);
    dados.falharCache = true;
    await aba.suspenderApresentacao(true);
    expect(dados.registro.vinculo).toBeNull();
    expect(dados.marcador?.geracao).toBe(A);
    expect((await aba.lerEstadoPush())?.encerramento).toBe(true);
    expect((await worker.lerEstadoPush())?.vinculo).toBeNull();
    expect((await worker.lerEstadoPush())?.encerramento).toBe(true);
    expect(await worker.registrarVinculo(A, vinculo, new AbortController().signal)).toBe(false);
  });
  it('cache ausente ou ilegível não é autorização de apresentação', async () => {
    const { dados } = ambiente;
    dados.falharLeituraCache = true;
    expect((await aba.lerEstadoPush())?.vinculo).toBeNull();
    dados.falharLeituraCache = false;
    dados.marcador = null;
    expect((await aba.lerEstadoPush())?.vinculo).toBeNull();
    const novo = await aba.prepararEstadoPush();
    expect(novo?.geracao).not.toBe(A);
    expect(await aba.registrarVinculo(A, vinculo, new AbortController().signal)).toBe(false);
    expect(await aba.registrarVinculo(novo?.geracao, 'B'.repeat(43), new AbortController().signal)).toBe(true);
  });
  it('revalida geração após encerramento confirmado e rejeita resposta atrasada', async () => {
    await aba.lerEstadoPush();
    await aba.suspenderApresentacao(true);
    expect(await aba.prepararEstadoPush()).toBeNull();
    expect(await aba.confirmarEncerramento()).toBe(true);
    const novo = await aba.prepararEstadoPush();
    expect(novo?.geracao).not.toBe(A);
    expect(await aba.registrarVinculo(A, vinculo, new AbortController().signal)).toBe(false);
    expect(await aba.registrarVinculo(novo?.geracao, 'B'.repeat(43), new AbortController().signal)).toBe(true);
    expect((await aba.lerEstadoPush())?.vinculo).toBe('B'.repeat(43));
  });
  it('put síncrono que lança não impede a suspensão persistida no cache', async () => {
    const { dados } = ambiente;
    expect((await aba.lerEstadoPush())?.vinculo).toBe(vinculo);
    dados.falharPutSincrono = true;
    await aba.suspenderApresentacao(true);
    expect(dados.registro.vinculo).toBe(vinculo);
    expect(dados.marcador?.encerramento).toBe(true);
    expect((await worker.lerEstadoPush())?.vinculo).toBeNull();
    expect(await worker.registrarVinculo(A, vinculo, new AbortController().signal)).toBe(false);
  });
  it('falha das duas gravações mantém o bloqueio no contexto que recebeu a suspensão', async () => {
    const { dados } = ambiente;
    expect((await aba.lerEstadoPush())?.vinculo).toBe(vinculo);
    dados.falharIdb = true;
    dados.falharCache = true;
    await aba.suspenderApresentacao(true);
    expect(dados.registro.vinculo).toBe(vinculo);
    expect(dados.marcador?.geracao).toBe(A);
    expect((await aba.lerEstadoPush())?.vinculo).toBeNull();
    expect((await aba.lerEstadoPush())?.encerramento).toBe(true);
    expect(await aba.registrarVinculo(A, vinculo, new AbortController().signal)).toBe(false);
  });
});
