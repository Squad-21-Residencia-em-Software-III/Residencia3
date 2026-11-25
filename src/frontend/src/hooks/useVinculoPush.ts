import { useEffect } from 'react';
import { recursoAtivo } from '../config/recursosBackend';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import { cumprirEncerramento, marcarEncerramento } from '../utils/encerramentoPush';
import { comLimite, emSequencia, sinalDaSessao } from '../utils/operacoesPush';
import { assinaturaDoAparelho, encerrarAssinatura } from '../utils/pushNavegador';

const ESPERA_INICIAL_MS = 5_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

/**
 * Mantém os alertas do aparelho só com quem está na conta: cumpre o encerramento que falhou ao sair e, ao
 * entrar, encerra a assinatura deixada por outra conta (ex.: sessão que expirou sem sair). O que não der certo
 * é tentado de novo quando a conexão volta, quando a tela reaparece ou depois de um tempo, até resolver.
 */
export function useVinculoPush(usuarioId: number | undefined) {
  useEffect(() => {
    if (!recursoAtivo('webPush')) return;
    let ativo = true;
    let rodando = false;
    let resolvido = false;
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sinal = sinalDaSessao();
    const valeAinda = () => ativo && !sinal.aborted;

    const conferir = async () => {
      if (!valeAinda()) return;
      if (!(await cumprirEncerramento())) throw new Error('Encerramento pendente.');
      if (usuarioId === undefined) return;
      const assinatura = await assinaturaDoAparelho();
      if (!assinatura) return;
      const { ativa } = await comLimite(sinal, (s) => notificacoesPushApi.situacao(assinatura.endpoint, s));
      if (!valeAinda() || ativa) return;
      if (!(await encerrarAssinatura(assinatura.endpoint))) throw new Error('A assinatura continua no navegador.');
    };

    const tentar = async () => {
      if (rodando || resolvido || !ativo) return;
      rodando = true;
      clearTimeout(timer);
      try {
        // Na fila: no meio de uma ativação, a assinatura ainda não está no servidor e pareceria de outra conta
        await emSequencia(conferir);
        resolvido = true;
      } catch {
        if (valeAinda()) {
          timer = setTimeout(() => void tentar(), Math.min(ESPERA_MAXIMA_MS, ESPERA_INICIAL_MS * 2 ** tentativas));
          tentativas += 1;
        }
      } finally {
        rodando = false;
      }
    };

    const aoReaparecer = () => {
      if (document.visibilityState === 'visible') void tentar();
    };
    const aoConectar = () => void tentar();
    window.addEventListener('online', aoConectar);
    document.addEventListener('visibilitychange', aoReaparecer);
    void tentar();
    return () => {
      ativo = false;
      clearTimeout(timer);
      window.removeEventListener('online', aoConectar);
      document.removeEventListener('visibilitychange', aoReaparecer);
    };
  }, [usuarioId]);
}

/**
 * Sair da conta encerra os alertas só neste aparelho. Chamar antes de limpar o token: ele é usado para
 * cancelar no servidor. Não atrasa nem impede a saída. Se o navegador falhar, fica marcado e `useVinculoPush`
 * tenta de novo; se o servidor falhar, o back descarta no próximo envio (404/410).
 */
export function encerrarPushAoSair(token: string | null): void {
  if (!recursoAtivo('webPush')) return;
  marcarEncerramento();
  emSequencia(async () => {
    const assinatura = await assinaturaDoAparelho();
    if (assinatura && token) {
      const { endpoint } = assinatura;
      comLimite(null, (signal) => notificacoesPushApi.cancelar(endpoint, { token, signal })).catch(() => undefined);
    }
    await cumprirEncerramento();
  }).catch(() => undefined);
}
