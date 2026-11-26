import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
let registro: { geracao: string; encerramento: boolean } | null;
let falhaEscrita: boolean;
let falhaLeitura: boolean;

class RespostaCacheTeste {
  constructor(private readonly corpo: string) {}
  async json() { return JSON.parse(this.corpo); }
}

beforeEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.stubGlobal('Response', RespostaCacheTeste);
  registro = { geracao: A, encerramento: false };
  falhaEscrita = false;
  falhaLeitura = false;
  vi.stubGlobal('caches', { open: async () => ({
    match: async () => {
      if (falhaLeitura) throw new Error('CacheStorage indisponível');
      return registro ? new Response(JSON.stringify(registro)) : undefined;
    },
    put: async (_url: string, resposta: Response) => {
      if (falhaEscrita) throw new Error('Falha na gravação');
      registro = await resposta.json();
    },
  }) });
  vi.stubGlobal('navigator', { locks: { request: async (_nome: string, _opts: unknown, acao: () => Promise<unknown>) => acao() } });
});
afterEach(() => vi.unstubAllGlobals());

const pedido = (geracao: string, anterior: string | null, encerramento = true) => ({
  tipo: 'SUSPENDER_APRESENTACAO_PUSH' as const, geracao, anterior, encerramento,
});

describe('barreira persistente do vínculo Push', () => {
  it('nega imediatamente a leitura enquanto a revogação está pendente', async () => {
    const m = await import('./barreiraPush');
    expect(await m.lerBarreira()).toEqual(registro);
    const suspensao = m.suspenderBarreira(pedido(B, A));
    expect(await m.lerBarreira()).toBeNull();
    expect(await suspensao).toBe(true);
    expect(await m.lerBarreira()).toEqual({ geracao: B, encerramento: true });
  });
  it('falha de escrita não restabelece o vínculo antigo, mesmo com leitura disponível', async () => {
    const m = await import('./barreiraPush');
    await m.lerBarreira();
    falhaEscrita = true;
    expect(await m.suspenderBarreira(pedido(B, A))).toBe(false);
    expect(await m.lerBarreira()).toBeNull();
    expect(m.encerramentoPendenteEmMemoria()).toBe(true);
    expect(await m.iniciarBarreira()).toBeNull();
    falhaEscrita = false;
    expect(await m.suspenderBarreira(pedido(B, A))).toBe(true);
    expect(await m.lerBarreira()).toEqual({ geracao: B, encerramento: true });
  });
  it('outro contexto e reinício do SW observam a marca persistida', async () => {
    const m = await import('./barreiraPush');
    await m.suspenderBarreira(pedido(B, A));
    vi.resetModules();
    const worker = await import('./barreiraPush');
    expect(await worker.lerBarreira()).toEqual({ geracao: B, encerramento: true });
  });
  it('mensagem atrasada com geração anterior conhecida não revoga uma geração nova', async () => {
    const m = await import('./barreiraPush');
    registro = { geracao: C, encerramento: false };
    expect(await m.suspenderBarreira(pedido(B, A), true)).toBe(false);
    expect(await m.lerBarreira()).toEqual({ geracao: C, encerramento: false });
  });
  it('confirmação exige a geração que foi efetivamente encerrada', async () => {
    const m = await import('./barreiraPush');
    await m.suspenderBarreira(pedido(B, A));
    expect(await m.concluirBarreira(A, C)).toBe(false);
    expect(await m.concluirBarreira(B, C)).toBe(true);
    expect(await m.lerBarreira()).toEqual({ geracao: C, encerramento: false });
  });
  it('falha de leitura e ausência de Web Locks falham de modo conservador', async () => {
    const m = await import('./barreiraPush');
    falhaLeitura = true;
    expect(await m.lerBarreira()).toBeNull();
    falhaLeitura = false;
    await m.lerBarreira();
    vi.stubGlobal('navigator', {});
    expect(await m.suspenderBarreira(pedido(B, A))).toBe(false);
    expect(await m.lerBarreira()).toBeNull();
  });
  it('suspensão de troca de conta não limpa um encerramento manual existente', async () => {
    const m = await import('./barreiraPush');
    await m.suspenderBarreira(pedido(B, A));
    await m.suspenderBarreira(pedido(C, B, false));
    expect(await m.lerBarreira()).toEqual({ geracao: C, encerramento: true });
  });
});
