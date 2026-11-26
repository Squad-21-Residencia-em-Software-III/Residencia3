import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../config/database', () => ({ db: vi.fn() }));
vi.mock('../models/notificacaoOutboxModel', () => ({
  notificacaoOutboxModel: {
    encerrarVencidos: vi.fn(), reservar: vi.fn(), concluir: vi.fn(), esperaAteProximo: vi.fn(), destino: vi.fn(),
    registrarEnvio: vi.fn(),
  },
}));

import { app } from '../app';
import { notificacaoOutboxModel, type ItemFilaPush } from '../models/notificacaoOutboxModel';
import { acordarFilaPush, definirEnviadorPush, processarFilaPush, type EnviadorPush } from '../services/filaPush';

const modelo = vi.mocked(notificacaoOutboxModel);
const enviador = vi.fn<EnviadorPush>();
const payload = { notificacao_id: 9, titulo: 'Viagem agendada', corpo: 'Saída às 14:00.', url: '/viagens' };
const item = (dados: Partial<ItemFilaPush> = {}): ItemFilaPush => ({
  id: 1, usuario_id: 7, categoria: 'VIAGENS', payload_push: payload, tentativas: 1, max_tentativas: 5, ...dados,
});
const aparelho = (id: number) => ({ id, endpoint: `https://push.exemplo/${id}`, p256dh: `p${id}`, auth: `a${id}` });
const aparelhos = (...ids: number[]) => modelo.destino.mockResolvedValue(ids.map(aparelho));
const responder = (...status: number[]) => status.forEach((s) => enviador.mockResolvedValueOnce({ status: s }));
const conclusao = () => modelo.concluir.mock.calls[0]![1];
const fila = (...itens: ItemFilaPush[]) => modelo.reservar.mockResolvedValueOnce(itens);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  modelo.encerrarVencidos.mockResolvedValue(0);
  modelo.reservar.mockResolvedValue([]);
  modelo.concluir.mockResolvedValue(true);
  modelo.registrarEnvio.mockResolvedValue();
  modelo.esperaAteProximo.mockResolvedValue(null);
  aparelhos(1);
  enviador.mockResolvedValue({ status: 201 });
});

afterEach(() => {
  definirEnviadorPush(null);
  vi.useRealTimers();
});

describe('Resultado do envio', () => {
  it('entrega em todos os aparelhos', async () => {
    fila(item());
    aparelhos(1, 2);
    await processarFilaPush(enviador);
    expect(enviador.mock.calls.map(([a, p]) => [a.endpoint, p])).toEqual([
      ['https://push.exemplo/1', payload], ['https://push.exemplo/2', payload],
    ]);
    expect(conclusao()).toMatchObject({ status: 'ENVIADO' });
    expect(modelo.registrarEnvio).toHaveBeenCalledWith(aparelho(2), 'sucesso', 201);
  });

  it.each([404, 410])('%i descarta a assinatura e não tenta de novo', async (status) => {
    fila(item());
    responder(status);
    await processarFilaPush(enviador);
    expect(modelo.registrarEnvio).toHaveBeenCalledWith(aparelho(1), 'expirada', status);
    expect(conclusao()).toEqual({ status: 'IGNORADO', erro: 'SEM_ASSINATURA' });
  });

  it.each([408, 429, 500, 502, 503])('%i tenta de novo mais tarde, sem descartar a assinatura', async (status) => {
    fila(item());
    responder(status);
    await processarFilaPush(enviador);
    expect(modelo.registrarEnvio).toHaveBeenCalledWith(aparelho(1), 'falha', status);
    expect(conclusao()).toMatchObject({ status: 'PENDENTE', erro: `HTTP_${status}`, statusHttp: status, entregues: [] });
  });

  it.each([400, 401, 403, 413])('%i não adianta repetir', async (status) => {
    fila(item());
    responder(status);
    await processarFilaPush(enviador);
    expect(conclusao()).toEqual({ status: 'FALHA_DEFINITIVA', erro: `HTTP_${status}`, statusHttp: status });
    expect(modelo.registrarEnvio).toHaveBeenCalledWith(aparelho(1), 'falha', status);
  });

  it('erro de rede tenta de novo e não guarda o texto do erro', async () => {
    fila(item());
    enviador.mockRejectedValueOnce(new Error('ECONNREFUSED https://push.exemplo/1'));
    await processarFilaPush(enviador);
    expect(conclusao()).toMatchObject({ status: 'PENDENTE', erro: 'REDE', statusHttp: null });
  });

  it('serviço que não responde é cancelado em 10 segundos', async () => {
    vi.useFakeTimers();
    fila(item());
    let sinal: AbortSignal | undefined;
    enviador.mockImplementationOnce((_a, _p, s) => { sinal = s; return new Promise(() => undefined); });
    const fim = processarFilaPush(enviador);
    await vi.advanceTimersByTimeAsync(10_000);
    await fim;
    expect(sinal?.aborted).toBe(true);
    expect(conclusao()).toMatchObject({ status: 'PENDENTE', erro: 'TIMEOUT' });
  });
});

describe('Novas tentativas', () => {
  it.each([[1, 30], [2, 60], [3, 120], [4, 240]])('a %iª espera cerca de %i s', async (tentativas, base) => {
    fila(item({ tentativas }));
    responder(503);
    await processarFilaPush(enviador);
    const { esperaSegundos } = conclusao() as { esperaSegundos: number };
    expect(esperaSegundos).toBeGreaterThanOrEqual(base);
    expect(esperaSegundos).toBeLessThanOrEqual(Math.ceil(base * 1.2));
  });

  it.each([[600, 600], [999_999, 3600]])('respeita o Retry-After de %i s, até 1 hora', async (retryAfterSegundos, espera) => {
    fila(item());
    enviador.mockResolvedValueOnce({ status: 429, retryAfterSegundos });
    await processarFilaPush(enviador);
    expect(conclusao()).toMatchObject({ esperaSegundos: espera });
  });

  it('na última, encerra como falha', async () => {
    fila(item({ tentativas: 5 }));
    responder(503);
    await processarFilaPush(enviador);
    expect(conclusao()).toEqual({ status: 'FALHA_DEFINITIVA', erro: 'HTTP_503', statusHttp: 503 });
  });

  it('só repete nos aparelhos que faltam', async () => {
    fila(item());
    aparelhos(1, 2, 3);
    responder(201, 429, 400);
    await processarFilaPush(enviador);
    expect(conclusao()).toMatchObject({ status: 'PENDENTE', entregues: [1], definitivas: [3] });

    enviador.mockClear();
    modelo.concluir.mockClear();
    fila(item({ tentativas: 2, payload_push: { ...payload, entregues: [1], definitivas: [3] } }));
    aparelhos(1, 2, 3);
    await processarFilaPush(enviador);
    expect(enviador.mock.calls.map(([a, p]) => [a.endpoint, p])).toEqual([['https://push.exemplo/2', payload]]);
    expect(conclusao()).toMatchObject({ status: 'ENVIADO' });
  });

  it('entregue em um aparelho e esgotado em outro conta como enviado', async () => {
    fila(item({ tentativas: 5 }));
    aparelhos(1, 2);
    responder(201, 503);
    await processarFilaPush(enviador);
    expect(conclusao()).toMatchObject({ status: 'ENVIADO' });
  });

  it('já entregue em um aparelho, desligar a categoria depois não vira "ignorado"', async () => {
    fila(item({ payload_push: { ...payload, entregues: [1] } }));
    modelo.destino.mockResolvedValueOnce('CATEGORIA_DESLIGADA');
    await processarFilaPush(enviador);
    expect(conclusao()).toMatchObject({ status: 'ENVIADO' });
    expect(enviador).not.toHaveBeenCalled();
  });
});

describe('Isolamento', () => {
  it.each(['USUARIO_INATIVO', 'CATEGORIA_DESLIGADA', 'SEM_ASSINATURA'] as const)('%s: ignora sem enviar', async (motivo) => {
    fila(item());
    modelo.destino.mockResolvedValueOnce(motivo);
    await processarFilaPush(enviador);
    expect(enviador).not.toHaveBeenCalled();
    expect(conclusao()).toEqual({ status: 'IGNORADO', erro: motivo });
  });

  it('falha ao anotar a assinatura não reenvia o alerta já entregue', async () => {
    fila(item());
    modelo.registrarEnvio.mockRejectedValueOnce(new Error('limite de dispositivos'));
    await processarFilaPush(enviador);
    expect(conclusao()).toMatchObject({ status: 'ENVIADO' });
  });

  it('um item com erro não impede os outros nem os próximos lotes', async () => {
    fila(item(), item({ id: 2 }));
    fila(item({ id: 3 }));
    modelo.destino.mockRejectedValueOnce(new Error('banco'));
    await processarFilaPush(enviador);
    expect(modelo.concluir.mock.calls.map(([i]) => i.id)).toEqual([2, 3]);
  });

  it('o log não tem endpoint, usuário nem texto do aviso', async () => {
    fila(item(), item({ id: 2 }));
    enviador.mockRejectedValueOnce(new Error('https://push.exemplo/1'));
    modelo.registrarEnvio.mockRejectedValue(new Error('https://push.exemplo/1'));
    await processarFilaPush(enviador);
    const linhas = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].join('\n');
    expect(linhas).toContain('PUSH_FILA_PROCESSADA');
    expect(linhas).not.toMatch(/push\.exemplo|usuario|Viagem|Saída|viagens/i);
  });

  it('uma execução tem limite de itens', async () => {
    modelo.reservar.mockImplementation(async (limite) => Array.from({ length: limite }, (_, i) => item({ id: i + 1 })));
    await processarFilaPush(enviador);
    expect(modelo.concluir).toHaveBeenCalledTimes(200);
  });
});

describe('Execução no servidor', () => {
  const passar = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
  beforeEach(() => { vi.useFakeTimers(); });

  it('sem enviador, nada toca o banco', async () => {
    acordarFilaPush();
    await passar(3_600_000);
    expect(modelo.encerrarVencidos).not.toHaveBeenCalled();
  });

  it('ao ligar, processa o que ficou pendente; com a fila vazia, não fica consultando o banco', async () => {
    fila(item());
    definirEnviadorPush(enviador);
    await passar();
    expect(enviador).toHaveBeenCalledOnce();
    await passar(24 * 3_600_000);
    expect(modelo.encerrarVencidos).toHaveBeenCalledOnce();
  });

  it('volta na hora da próxima tentativa', async () => {
    modelo.esperaAteProximo.mockResolvedValueOnce(45_000);
    definirEnviadorPush(enviador);
    await passar(44_999);
    expect(modelo.encerrarVencidos).toHaveBeenCalledOnce();
    await passar(1);
    expect(modelo.encerrarVencidos).toHaveBeenCalledTimes(2);
  });

  it('item preso não vira um laço', async () => {
    modelo.esperaAteProximo.mockResolvedValue(0);
    definirEnviadorPush(enviador);
    await passar(5_500);
    expect(modelo.encerrarVencidos).toHaveBeenCalledTimes(6);
  });

  it('não roda duas vezes ao mesmo tempo, e o aviso que chega no meio é processado em seguida', async () => {
    let liberar: (v: ItemFilaPush[]) => void = () => undefined;
    modelo.reservar.mockReturnValueOnce(new Promise((resolve) => { liberar = resolve; }));
    definirEnviadorPush(enviador);
    await passar();
    acordarFilaPush();
    acordarFilaPush();
    await passar();
    expect(modelo.encerrarVencidos).toHaveBeenCalledOnce();
    liberar([]);
    await passar();
    expect(modelo.encerrarVencidos).toHaveBeenCalledTimes(2);
  });

  it('banco fora do ar: tenta de novo em 5 minutos', async () => {
    modelo.encerrarVencidos.mockRejectedValueOnce(new Error('fora do ar'));
    definirEnviadorPush(enviador);
    await passar(299_999);
    expect(modelo.encerrarVencidos).toHaveBeenCalledOnce();
    await passar(1);
    expect(modelo.encerrarVencidos).toHaveBeenCalledTimes(2);
  });

  it('desligar o enviador cancela a próxima execução', async () => {
    modelo.esperaAteProximo.mockResolvedValueOnce(45_000);
    definirEnviadorPush(enviador);
    await passar();
    definirEnviadorPush(null);
    await passar(60_000);
    expect(modelo.encerrarVencidos).toHaveBeenCalledOnce();
  });

  it('uma requisição aproveita para conferir a fila, no máximo uma vez por minuto', async () => {
    vi.useRealTimers();
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(10_000_000);
    definirEnviadorPush(enviador);
    await vi.waitFor(() => expect(modelo.esperaAteProximo).toHaveBeenCalledOnce());
    for (let i = 0; i < 3; i += 1) await request(app).get('/api/inexistente');
    expect(modelo.encerrarVencidos).toHaveBeenCalledTimes(2);
    relogio.mockReturnValue(10_060_000);
    await request(app).get('/api/inexistente');
    expect(modelo.encerrarVencidos).toHaveBeenCalledTimes(3);
    relogio.mockRestore();
  });
});
