import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { recursoAtivo } from '../../config/recursosBackend';
import { useMarcarReferenciaLida } from '../../contexts/NotificacoesContext';
import { mensagemDeErro } from '../../services/api/http';
import { veiculosApi } from '../../services/api/veiculosApi';
import { viagensApi } from '../../services/api/viagensApi';
import type { Veiculo } from '../../types/veiculo';
import { chaveViagem, viagemEmCurso, type Viagem } from '../../types/viagem';
import { usePermissao } from '../../utils/permissoes';
import { useRegistrarChegada } from '../viagens/useRegistrarChegada';
import { useAviso } from './useAviso';

const instante = (iso?: string | null) => (iso ? new Date(iso).getTime() : null);

/** Agendadas: a mais próxima primeiro; sem horário previsto, no fim. */
function porPartida(a: Viagem, b: Viagem) {
  return (instante(a.inicio_previsto) ?? Infinity) - (instante(b.inicio_previsto) ?? Infinity) || a.id - b.id;
}

/** Histórico: a mais recente primeiro. */
function porRecente(a: Viagem, b: Viagem) {
  const data = (v: Viagem) =>
    instante(v.data_hora_efetiva_chegada ?? v.data_hora_efetiva_saida ?? v.inicio_previsto) ?? 0;
  return data(b) - data(a) || b.id - a.id;
}

/**
 * Viagens do motorista logado, agrupadas pelo momento, e as ações de cada uma. Segue as mesmas
 * regras de `ViagensPage`; a API continua sendo quem autoriza.
 */
export function useViagensMotorista() {
  const { pode, abasDeViagens } = usePermissao();
  const operacao = abasDeViagens()[0];
  const isSvo = operacao === 'SVO';
  const agendaSvoAtiva = recursoAtivo('agendamentoTemporalSvo');
  const podeExecutar = isSvo
    ? agendaSvoAtiva && pode('viagens.executarSvo')
    : pode('viagens.executar');

  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState<Viagem | null>(null);
  const [finalizando, setFinalizando] = useState<Viagem | null>(null);
  const [chaveDetalhes, setChaveDetalhes] = useState<string | null>(null);
  const { aviso, avisar, fecharAviso } = useAviso();
  // Ordem das consultas: com a rede lenta, uma resposta antiga não pode desfazer o que já está na tela
  const ultimaConsulta = useRef(0);
  const consultaNaTela = useRef(0);

  const recarregar = useCallback(async () => {
    const consulta = ++ultimaConsulta.current;
    // O km do veículo é só uma referência no formulário: sem ele, a tela continua funcionando
    const [lista, frota] = await Promise.allSettled([viagensApi.listar(), veiculosApi.listar()]);
    if (consulta < consultaNaTela.current) return;
    consultaNaTela.current = consulta;
    if (frota.status === 'fulfilled') setVeiculos(frota.value);
    if (lista.status === 'fulfilled') {
      setViagens(lista.value.filter((v) => v.tipo_operacao === operacao));
      setErroCarga(null);
    } else {
      setErroCarga(mensagemDeErro(lista.reason));
    }
    setCarregando(false);
  }, [operacao]);

  useEffect(() => {
    void recarregar();
    // O motorista deixa o aplicativo aberto: ao voltar para ele, atualiza a lista
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void recarregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [recarregar]);

  const aplicarChegada = (alteracao: SetStateAction<Viagem[]>) => {
    // Consultas já enviadas podem ser anteriores à chegada: são descartadas e refeitas
    const haviaConsulta = ultimaConsulta.current > consultaNaTela.current;
    consultaNaTela.current = ++ultimaConsulta.current;
    setViagens(alteracao);
    if (haviaConsulta) void recarregar();
  };

  const { chegadasPendentes, registrarChegada } = useRegistrarChegada({
    habilitado: isSvo && podeExecutar,
    setViagens: aplicarChegada,
    exibirFeedback: avisar,
  });

  const grupos = useMemo(
    () => ({
      agora: viagens.filter((v) => viagemEmCurso(v.status)).sort(porPartida),
      proximas: viagens.filter((v) => v.status === 'AGENDADA').sort(porPartida),
      historico: viagens.filter((v) => v.status === 'CONCLUIDA' || v.status === 'CANCELADA').sort(porRecente),
    }),
    [viagens],
  );

  const salvarInicio = async (km: number, evidenciaId?: string) => {
    if (!iniciando) return;
    await viagensApi.iniciar(iniciando, km, evidenciaId);
    await recarregar();
    avisar(isSvo ? 'Coleta iniciada.' : 'Viagem iniciada.');
  };

  const salvarFim = async (km: number, evidenciaId?: string) => {
    if (!finalizando) return;
    await viagensApi.finalizar(finalizando, km, evidenciaId);
    await recarregar();
    avisar(isSvo ? 'Coleta finalizada.' : 'Viagem finalizada.');
  };

  const detalhes = viagens.find((v) => chaveViagem(v) === chaveDetalhes) ?? null;
  useMarcarReferenciaLida(
    detalhes ? (detalhes.tipo_operacao === 'SVO' ? 'ORDEM_SVO' : 'VIAGEM_FROTA') : null,
    detalhes?.id,
  );

  return {
    isSvo,
    coletasDesabilitadas: isSvo && !agendaSvoAtiva,
    podeExecutar,
    // Na frota administrativa o motorista faz uma viagem por vez; no SVO, as ordens seguem juntas
    saidaBloqueada: !isSvo && grupos.agora.length > 0,
    grupos,
    carregando,
    erroCarga,
    recarregar,
    aviso,
    fecharAviso,
    chegadasPendentes,
    registrarChegada,
    iniciando,
    setIniciando,
    salvarInicio,
    finalizando,
    setFinalizando,
    salvarFim,
    kmDoVeiculo: (id: number) => veiculos.find((v) => v.id === id)?.km_atual,
    detalhes,
    abrirDetalhes: (v: Viagem) => setChaveDetalhes(chaveViagem(v)),
    fecharDetalhes: () => setChaveDetalhes(null),
  };
}

export type ViagensMotorista = ReturnType<typeof useViagensMotorista>;
