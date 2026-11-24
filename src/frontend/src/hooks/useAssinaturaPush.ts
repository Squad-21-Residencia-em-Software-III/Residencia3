import { useCallback, useEffect, useRef, useState } from 'react';
import { mensagemDeErro } from '../services/api/http';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import {
  assinaturaDoAparelho,
  criarAssinatura,
  dadosDaAssinatura,
  encerrarAssinaturaDoAparelho,
  suportaPush,
} from '../utils/pushNavegador';
import type { EstadoPermissao } from './usePermissoesDispositivo';

export type SituacaoPush = 'verificando' | 'indisponivel' | 'bloqueada' | 'inativa' | 'ativa' | 'falha';

interface OpcoesAssinaturaPush {
  usuarioId: number | undefined;
  online: boolean;
  permissao: EstadoPermissao;
  /** Precisa ser chamada direto do toque: alguns navegadores recusam o pedido depois de uma espera. */
  solicitarPermissao: () => Promise<EstadoPermissao>;
}

/** Alertas neste aparelho: confere, liga e desliga a assinatura do usuário logado. */
export function useAssinaturaPush({ usuarioId, online, permissao, solicitarPermissao }: OpcoesAssinaturaPush) {
  const [situacao, setSituacao] = useState<SituacaoPush>('verificando');
  const [ocupado, setOcupado] = useState(false);
  const [erroConferencia, setErroConferencia] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const emAndamento = useRef(false);
  const ultimaVerificacao = useRef(0);
  const usuarioAtual = useRef(usuarioId);

  const verificar = useCallback(async () => {
    if (emAndamento.current) return;
    const verificacao = ++ultimaVerificacao.current;
    const concluir = (nova: SituacaoPush, mensagem: string | null = null) => {
      if (verificacao !== ultimaVerificacao.current) return;
      setSituacao(nova);
      setErroConferencia(mensagem);
    };

    if (!suportaPush()) return concluir('indisponivel');
    if (permissao === 'denied') return concluir('bloqueada');
    if (permissao !== 'granted') return concluir('inativa');
    try {
      const assinatura = await assinaturaDoAparelho();
      if (!assinatura) return concluir('inativa');
      const { ativa } = await notificacoesPushApi.situacao(assinatura.endpoint);
      concluir(ativa ? 'ativa' : 'inativa');
    } catch (e) {
      concluir('falha', mensagemDeErro(e));
    }
  }, [permissao]);
  const verificarAtual = useRef(verificar);
  useEffect(() => {
    verificarAtual.current = verificar;
  }, [verificar]);

  // Outra conta no mesmo aparelho: o que está na tela era da conta anterior
  useEffect(() => {
    usuarioAtual.current = usuarioId;
    ultimaVerificacao.current += 1;
    setSituacao('verificando');
    setErroConferencia(null);
    setErroAcao(null);
  }, [usuarioId]);

  useEffect(() => {
    if (online) void verificar();
  }, [usuarioId, online, verificar]);

  const executar = async (acao: () => Promise<SituacaoPush>) => {
    if (emAndamento.current) return;
    const dono = usuarioId;
    emAndamento.current = true;
    ultimaVerificacao.current += 1;
    setOcupado(true);
    setErroAcao(null);
    try {
      const nova = await acao();
      if (usuarioAtual.current === dono) setSituacao(nova);
    } catch (e) {
      if (usuarioAtual.current === dono) setErroAcao(mensagemDeErro(e));
    } finally {
      emAndamento.current = false;
      setOcupado(false);
      // A conta mudou durante a ação: confere de novo, já como a conta atual
      if (usuarioAtual.current !== dono) void verificarAtual.current();
    }
  };

  const ligar = () =>
    executar(async () => {
      const dono = usuarioId;
      const resposta = await solicitarPermissao();
      if (resposta === 'denied') return 'bloqueada';
      if (resposta === 'unsupported') return 'indisponivel';
      if (resposta !== 'granted') {
        setErroAcao('Os alertas não foram ligados, porque o pedido do navegador foi fechado sem resposta.');
        return 'inativa';
      }

      const { chave_publica } = await notificacoesPushApi.chavePublica();
      const assinatura = await criarAssinatura(chave_publica);
      try {
        const dados = dadosDaAssinatura(assinatura);
        const conferirConta = () => {
          if (usuarioAtual.current !== dono) throw new Error('A conta mudou durante a ativação.');
        };
        conferirConta();
        await notificacoesPushApi.assinar(dados);
        conferirConta();
      } catch (e) {
        // Sem o registro no servidor, ou com outra conta, o aparelho não pode ficar assinado
        await assinatura.unsubscribe().catch(() => false);
        throw e;
      }
      return 'ativa';
    });

  const desligar = () =>
    executar(async () => {
      const assinatura = await assinaturaDoAparelho();
      if (!assinatura) return 'inativa';
      const [noServidor, noAparelho] = await Promise.allSettled([
        notificacoesPushApi.cancelar(assinatura.endpoint),
        encerrarAssinaturaDoAparelho(),
      ]);
      // Um dos dois já basta para os alertas pararem de chegar
      if (noServidor.status === 'rejected' && noAparelho.status === 'rejected') throw noServidor.reason;
      return 'inativa';
    });

  return { situacao, ocupado, erro: erroAcao ?? erroConferencia, verificar, ligar, desligar };
}
