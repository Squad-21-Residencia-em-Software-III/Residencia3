import { useEffect } from 'react';
import { recursoAtivo } from '../config/recursosBackend';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import { comLimite, emSequencia, sinalDaSessao } from '../utils/operacoesPush';
import { assinaturaDoAparelho, encerrarAssinatura } from '../utils/pushNavegador';

/**
 * Ao entrar, encerra a assinatura deixada por outra conta neste aparelho (ex.: sessão que expirou
 * sem sair). Sem resposta do servidor, nada muda.
 */
export function useVinculoPush(usuarioId: number | undefined) {
  useEffect(() => {
    if (usuarioId === undefined || !recursoAtivo('webPush')) return;
    let ativo = true;
    const sinal = sinalDaSessao();
    const conferir = async () => {
      if (!ativo || sinal.aborted) return;
      const assinatura = await assinaturaDoAparelho();
      if (!assinatura) return;
      const { ativa } = await comLimite(sinal, (s) => notificacoesPushApi.situacao(assinatura.endpoint, s));
      if (!ativo || sinal.aborted || ativa) return;
      await encerrarAssinatura(assinatura.endpoint);
    };
    // Na fila: no meio de uma ativação, a assinatura ainda não está no servidor e pareceria de outra conta
    emSequencia(conferir).catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [usuarioId]);
}

/**
 * Sair da conta encerra os alertas só neste aparelho. Chamar antes de limpar o token: ele é usado para
 * cancelar no servidor. Não atrasa nem impede a saída; se falhar, o back descarta no próximo envio (404/410).
 */
export function encerrarPushAoSair(token: string | null): void {
  if (!recursoAtivo('webPush')) return;
  emSequencia(async () => {
    const assinatura = await assinaturaDoAparelho();
    if (!assinatura) return;
    const { endpoint } = assinatura;
    if (token) {
      comLimite(null, (signal) => notificacoesPushApi.cancelar(endpoint, { token, signal })).catch(() => undefined);
    }
    await encerrarAssinatura(endpoint);
  }).catch(() => undefined);
}
