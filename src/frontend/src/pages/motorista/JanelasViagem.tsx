import type { Viagem } from '../../types/viagem';
import { DrawerDetalhesViagem } from '../viagens/DrawerDetalhesViagem';
import { ModalFinalizarViagem } from '../viagens/ModalFinalizarViagem';
import { ModalIniciarViagem } from '../viagens/ModalIniciarViagem';
import { AvisoFlutuante } from './comuns';
import type { ViagensMotorista } from './useViagensMotorista';

/** Detalhes, saída, chegada e avisos, compartilhados por Início e Viagens. */
export function JanelasViagem({ painel }: { painel: ViagensMotorista }) {
  const { iniciando, finalizando, detalhes, podeExecutar } = painel;
  /** Fecha os detalhes antes da ação, que abre a própria janela ou mostra um aviso. */
  const aposFechar = (acao: (v: Viagem) => void) => (v: Viagem) => {
    painel.fecharDetalhes();
    acao(v);
  };
  return (
    <>
      <DrawerDetalhesViagem
        compacto
        viagem={detalhes}
        onClose={painel.fecharDetalhes}
        onIniciar={podeExecutar && !painel.saidaBloqueada ? aposFechar(painel.setIniciando) : undefined}
        onFinalizar={podeExecutar ? aposFechar(painel.setFinalizando) : undefined}
        onRegistrarChegada={
          podeExecutar && painel.isSvo
            ? async (v) => {
                painel.fecharDetalhes();
                await painel.registrarChegada(v);
              }
            : undefined
        }
        registrandoChegada={detalhes !== null && painel.chegadasPendentes.has(detalhes.id)}
      />
      {iniciando && (
        <ModalIniciarViagem
          compacto
          kmReferencia={painel.kmDoVeiculo(iniciando.veiculo_id)}
          viagem={iniciando}
          onClose={() => painel.setIniciando(null)}
          onSalvar={painel.salvarInicio}
        />
      )}
      {finalizando && (
        <ModalFinalizarViagem
          compacto
          viagem={finalizando}
          onClose={() => painel.setFinalizando(null)}
          onSalvar={painel.salvarFim}
        />
      )}
      <AvisoFlutuante aviso={painel.aviso} onFechar={painel.fecharAviso} />
    </>
  );
}
