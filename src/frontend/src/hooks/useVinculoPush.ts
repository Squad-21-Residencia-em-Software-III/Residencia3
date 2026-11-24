import { useEffect } from 'react';
import { recursoAtivo } from '../config/recursosBackend';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import { assinaturaDoAparelho, encerrarAssinaturaDoAparelho } from '../utils/pushNavegador';

/**
 * Ao entrar, encerra a assinatura deixada por outra conta neste aparelho (ex.: sessão que expirou
 * sem sair). Sem resposta do servidor, nada muda.
 */
export function useVinculoPush(usuarioId: number | undefined) {
  useEffect(() => {
    if (usuarioId === undefined || !recursoAtivo('webPush')) return;
    let ativo = true;
    const conferir = async () => {
      const assinatura = await assinaturaDoAparelho();
      if (!assinatura || !ativo) return;
      const { ativa } = await notificacoesPushApi.situacao(assinatura.endpoint);
      if (!ativo || ativa) return;
      // Só encerra a que foi conferida: o usuário pode ter acabado de ligar os alertas
      const atual = await assinaturaDoAparelho();
      if (ativo && atual?.endpoint === assinatura.endpoint) await atual.unsubscribe();
    };
    conferir().catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [usuarioId]);
}

/** Ao sair da conta, os alertas param neste aparelho; os outros aparelhos continuam. */
export function encerrarPushAoSair(): void {
  if (!recursoAtivo('webPush')) return;
  encerrarAssinaturaDoAparelho().catch(() => undefined);
}
