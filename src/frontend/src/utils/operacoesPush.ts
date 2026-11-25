const TRAVA = 'fsph-push';
const LIMITE_RESPOSTA_MS = 10_000;

let sessao = new AbortController();

/** Sinal da sessão atual. Uma operação guarda o sinal ao começar e para se a sessão acabar no meio. */
export function sinalDaSessao(): AbortSignal {
  return sessao.signal;
}

/**
 * A sessão acabou ou mudou (sair, expirar, sair em outra aba, entrar). Vale mesmo que a tela que começou
 * a operação já tenha sido fechada.
 */
export function invalidarOperacoesPush(): void {
  sessao.abort();
  sessao = new AbortController();
}

let filaLocal: Promise<unknown> = Promise.resolve();

/**
 * Uma operação por vez no aparelho: a assinatura do navegador é a mesma em todas as abas. Sem Web Locks, os
 * alertas não podem ser ligados (`suportaPush`), e a fila desta aba serve só para encerrar.
 */
export async function emSequencia<T>(acao: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request(TRAVA, acao);
  const resultado = filaLocal.then(acao);
  filaLocal = resultado.catch(() => undefined);
  return resultado;
}

/** Espera a API por tempo limitado e para na hora se a sessão acabar, para não prender as outras abas. */
export function comLimite<T>(
  sinal: AbortSignal | null,
  chamada: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controle = new AbortController();
    const parar = (mensagem: string) => {
      reject(new Error(mensagem));
      controle.abort();
    };
    const aoEncerrar = () => parar('A sessão foi encerrada.');
    if (sinal?.aborted) return aoEncerrar();
    const timer = setTimeout(() => parar('O servidor demorou a responder. Tente de novo.'), LIMITE_RESPOSTA_MS);
    sinal?.addEventListener('abort', aoEncerrar);
    chamada(controle.signal)
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
        sinal?.removeEventListener('abort', aoEncerrar);
      });
  });
}
