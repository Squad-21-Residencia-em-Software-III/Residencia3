import { prepararEstadoPush, registrarVinculo, suspenderApresentacao } from '../sw/estadoPush';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, mensagemDeErro, tokenStorage } from '../services/api/http';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import { cumprirEncerramento } from '../utils/encerramentoPush';
import { comLimite, emSequencia, sinalDaSessao } from '../utils/operacoesPush';
import {
  assinaturaDoAparelho,
  criarAssinatura,
  dadosDaAssinatura,
  encerrarAssinatura,
  suportaPush,
} from '../utils/pushNavegador';
import type { EstadoPermissao } from './usePermissoesDispositivo';

const CANAL_PUSH = 'fsph_push';

export type SituacaoPush = 'verificando' | 'indisponivel' | 'bloqueada' | 'inativa' | 'ativa' | 'falha';

interface OpcoesAssinaturaPush {
  usuarioId: number | undefined;
  online: boolean;
  permissao: EstadoPermissao;
  /** Precisa ser chamada direto do toque: alguns navegadores recusam o pedido depois de uma espera. */
  solicitarPermissao: () => Promise<EstadoPermissao>;
}

/** Desfaz a ativação que não terminou. O servidor pode ter registrado mesmo sem a resposta ter chegado. */
async function desfazerAtivacao(endpoint: string, token: string | null, erro: unknown) {
  const recusada = erro instanceof ApiError && erro.status >= 400 && erro.status < 500;
  if (token && !recusada) {
    comLimite(null, (signal) => notificacoesPushApi.cancelar(endpoint, { token, signal })).catch(() => undefined);
  }
  await encerrarAssinatura(endpoint).catch(() => false);
}

/** O que ficou marcado ao sair de uma conta vem antes de conferir ou ligar. */
async function cumprirEncerramentoAnterior() {
  if (!(await cumprirEncerramento())) {
    throw new Error('Não foi possível encerrar os alertas anteriores deste aparelho. Tente de novo.');
  }
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
  const canal = useRef<BroadcastChannel | null>(null);

  const verificar = useCallback(async () => {
    if (emAndamento.current) return;
    const verificacao = ++ultimaVerificacao.current;
    const sinal = sinalDaSessao();
    const concluir = (nova: SituacaoPush, mensagem: string | null = null) => {
      if (verificacao !== ultimaVerificacao.current || sinal.aborted) return;
      setSituacao(nova);
      setErroConferencia(mensagem);
    };

    if (!suportaPush()) return concluir('indisponivel');
    if (permissao === 'denied') return concluir('bloqueada');
    if (permissao !== 'granted') return concluir('inativa');
    try {
      await emSequencia(async () => {
        if (verificacao !== ultimaVerificacao.current) return;
        await cumprirEncerramentoAnterior();
        const assinatura = await assinaturaDoAparelho();
        if (!assinatura) return concluir('inativa');
        const estado = await prepararEstadoPush();
        const { ativa, vinculo } = await comLimite(sinal, (s) => notificacoesPushApi.situacao(assinatura.endpoint, s));
        if (ativa && verificacao === ultimaVerificacao.current && !(await registrarVinculo(estado?.geracao, vinculo, sinal))) {
          throw new Error('Não foi possível confirmar o vínculo local dos alertas.');
        }
        concluir(ativa ? 'ativa' : 'inativa');
      });
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
    return () => {
      ultimaVerificacao.current += 1;
    };
  }, [usuarioId]);

  useEffect(() => {
    if (online) void verificar();
  }, [usuarioId, online, verificar]);

  // Ligou ou desligou em outra aba: esta acompanha
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const aberto = new BroadcastChannel(CANAL_PUSH);
    canal.current = aberto;
    aberto.onmessage = () => void verificarAtual.current();
    return () => {
      canal.current = null;
      aberto.close();
    };
  }, []);

  const executar = async (acao: (conferirSessao: () => void, sinal: AbortSignal) => Promise<SituacaoPush>) => {
    if (emAndamento.current) return;
    const dono = usuarioId;
    const sinal = sinalDaSessao();
    const mesmaSessao = () => !sinal.aborted && usuarioAtual.current === dono;
    const conferirSessao = () => {
      if (!mesmaSessao()) throw new Error('A sessão mudou durante a operação.');
    };
    emAndamento.current = true;
    ultimaVerificacao.current += 1;
    setOcupado(true);
    setErroAcao(null);
    try {
      const nova = await acao(conferirSessao, sinal);
      if (mesmaSessao()) {
        setSituacao(nova);
        canal.current?.postMessage('mudou');
      }
    } catch (e) {
      if (mesmaSessao()) setErroAcao(mensagemDeErro(e));
    } finally {
      emAndamento.current = false;
      setOcupado(false);
      // A conta mudou durante a ação: confere de novo, já como a conta atual
      if (usuarioAtual.current !== dono) void verificarAtual.current();
    }
  };

  const ligar = () =>
    executar(async (conferirSessao, sinal) => {
      // Fora da fila: o pedido do navegador pode ficar aberto por muito tempo
      const resposta = await solicitarPermissao();
      if (resposta === 'denied') return 'bloqueada';
      if (resposta === 'unsupported') return 'indisponivel';
      if (resposta !== 'granted') {
        setErroAcao('Os alertas não foram ligados, porque o pedido do navegador foi fechado sem resposta.');
        return 'inativa';
      }

      return emSequencia<SituacaoPush>(async () => {
        conferirSessao();
        await cumprirEncerramentoAnterior();
        const estado = await prepararEstadoPush();
        if (!estado) throw new Error('Armazenamento seguro de alertas indisponível. Tente novamente.');
        // Outra aba pode ter acabado de ligar: não troca a assinatura que já vale
        const existente = await assinaturaDoAparelho();
        if (existente) {
          const { ativa, vinculo } = await comLimite(sinal, (s) => notificacoesPushApi.situacao(existente.endpoint, s));
          if (ativa) {
            if (!(await registrarVinculo(estado.geracao, vinculo, sinal))) throw new Error('Vínculo local não confirmado.');
            return 'ativa';
          }
        }
        const { publicKey } = await comLimite(sinal, (s) => notificacoesPushApi.chavePublica(s));
        conferirSessao();
        const assinatura = await criarAssinatura(publicKey);
        const token = tokenStorage.get();
        try {
          const dados = dadosDaAssinatura(assinatura);
          conferirSessao();
          await comLimite(sinal, (s) => notificacoesPushApi.assinar(dados, s));
          conferirSessao();
          const { vinculo } = await comLimite(sinal, (s) => notificacoesPushApi.situacao(assinatura.endpoint, s));
          if (!(await registrarVinculo(estado.geracao, vinculo, sinal))) throw new Error('Vínculo local não confirmado.');
          conferirSessao();
        } catch (e) {
          // Sem o registro no servidor, ou com outra sessão, o aparelho não pode ficar assinado
          await desfazerAtivacao(assinatura.endpoint, token, e);
          throw e;
        }
        return 'ativa';
      });
    });

  const desligar = () =>
    executar((conferirSessao, sinal) =>
      emSequencia<SituacaoPush>(async () => {
        conferirSessao();
        await suspenderApresentacao(false);
        const assinatura = await assinaturaDoAparelho();
        if (!assinatura) return 'inativa';
        const { endpoint } = assinatura;
        const [noServidor, noAparelho] = await Promise.allSettled([
          comLimite(sinal, (signal) => notificacoesPushApi.cancelar(endpoint, { signal })),
          encerrarAssinatura(endpoint),
        ]);
        // Um dos dois já basta para os alertas pararem de chegar
        const encerradaNoAparelho = noAparelho.status === 'fulfilled' && noAparelho.value;
        if (noServidor.status === 'rejected' && !encerradaNoAparelho) throw noServidor.reason;
        return 'inativa';
      }),
    );

  return { situacao, ocupado, erro: erroAcao ?? erroConferencia, verificar, ligar, desligar };
}
