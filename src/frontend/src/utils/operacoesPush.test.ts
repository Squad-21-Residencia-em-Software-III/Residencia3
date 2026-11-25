import { afterEach, describe, expect, it, vi } from 'vitest';
import { comLimite, emSequencia, invalidarOperacoesPush, sinalDaSessao } from './operacoesPush';

const semResposta = () => new Promise<never>(() => undefined);

afterEach(() => vi.useRealTimers());

describe('comLimite', () => {
  it('para de esperar depois de 10 segundos e cancela a chamada', async () => {
    vi.useFakeTimers();
    let sinal: AbortSignal | undefined;
    const espera = comLimite(null, (s) => {
      sinal = s;
      return semResposta();
    });
    const resultado = expect(espera).rejects.toThrow('O servidor demorou a responder');
    await vi.advanceTimersByTimeAsync(10_000);
    await resultado;
    expect(sinal?.aborted).toBe(true);
  });

  it('para na hora quando a sessão acaba', async () => {
    const espera = comLimite(sinalDaSessao(), semResposta);
    invalidarOperacoesPush();
    await expect(espera).rejects.toThrow('A sessão foi encerrada.');
  });

  it('com a sessão já encerrada, nem chama', async () => {
    const antigo = sinalDaSessao();
    invalidarOperacoesPush();
    const chamada = vi.fn(semResposta);
    await expect(comLimite(antigo, chamada)).rejects.toThrow('A sessão foi encerrada.');
    expect(chamada).not.toHaveBeenCalled();
    expect(sinalDaSessao().aborted).toBe(false);
  });
});

describe('emSequencia', () => {
  it('uma falha não prende a próxima operação', async () => {
    const falha = emSequencia(() => Promise.reject(new Error('falhou')));
    const seguinte = emSequencia(async () => 'ok');
    await expect(falha).rejects.toThrow('falhou');
    await expect(seguinte).resolves.toBe('ok');
  });
});
