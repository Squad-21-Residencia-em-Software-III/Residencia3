import { useRef, useState } from 'react';
import { Alert, Button, EmptyState } from '../../components/ui';
import { chaveViagem } from '../../types/viagem';
import { cn } from '../../utils/cn';
import { CartaoViagem } from './CartaoViagem';
import { BOTAO_GRANDE, Carregando, ErroDeCarga } from './comuns';
import { JanelasViagem } from './JanelasViagem';
import { ProximaEDepois } from './ProximaEDepois';
import { useViagensMotorista } from './useViagensMotorista';

type Aba = 'agora' | 'proximas' | 'historico';

const ABAS: { id: Aba; rotulo: string; vazio: string; dica: string }[] = [
  { id: 'agora', rotulo: 'Agora', vazio: 'Nada em andamento', dica: 'O que você iniciar aparece aqui.' },
  { id: 'proximas', rotulo: 'Próximas', vazio: 'Nada agendado', dica: 'Quando o gestor agendar, aparece aqui.' },
  { id: 'historico', rotulo: 'Histórico', vazio: 'Nenhum registro ainda', dica: 'O que você finalizar fica guardado aqui.' },
];

const ITENS_POR_VEZ = 10;

/** Viagens do motorista no celular: cartões separados pelo momento, no lugar da tabela. */
export default function MotoristaViagens() {
  const painel = useViagensMotorista();
  const { isSvo, grupos, carregando, erroCarga } = painel;
  const [escolhida, setEscolhida] = useState<Aba | null>(null);
  const [limite, setLimite] = useState(ITENS_POR_VEZ);
  const raiz = useRef<HTMLDivElement>(null);

  // Sem escolha, abre no que importa no momento; depois de iniciar ou finalizar, volta a isso
  const aba = escolhida ?? (grupos.agora.length > 0 ? 'agora' : 'proximas');
  const lista = grupos[aba];

  const escolher = (id: Aba) => {
    setEscolhida(id);
    setLimite(ITENS_POR_VEZ);
    const rolagem = raiz.current?.closest('main');
    if (rolagem) rolagem.scrollTop = 0;
  };

  // Embaixo, junto da barra: troca de lista sem precisar alcançar o topo da tela
  const filtros = (
    <div role="group" aria-label="Filtrar viagens" className="flex gap-1.5">
      {ABAS.map(({ id, rotulo }) => (
        <button
          key={id}
          type="button"
          aria-pressed={aba === id}
          onClick={() => escolher(id)}
          className={cn(
            'min-h-12 min-w-0 flex-1 rounded-lg border px-1 text-sm font-semibold',
            aba === id
              ? 'border-primary bg-primary text-white'
              : 'border-border bg-surface text-text-strong active:bg-surface-hover',
          )}
        >
          {rotulo}
          {id !== 'historico' && grupos[id].length > 0 && ` (${grupos[id].length})`}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={raiz} className="flex flex-1 flex-col gap-3">
      {painel.coletasDesabilitadas && (
        <Alert tone="info">As operações de coleta SVO estão desabilitadas neste ambiente.</Alert>
      )}

      {aba !== 'historico' && lista.length > 0 ? (
        <>
          {erroCarga && <ErroDeCarga mensagem={erroCarga} onTentar={() => void painel.recarregar()} />}
          <ProximaEDepois
            painel={painel}
            titulo={aba === 'agora' ? `${isSvo ? 'Coleta' : 'Viagem'} em andamento` : `Próxima ${isSvo ? 'coleta' : 'viagem'}`}
            destaque={aba === 'agora' ? lista : lista.slice(0, 1)}
            tituloDepois="Mais tarde"
            depois={aba === 'agora' ? [] : lista.slice(1)}
            acimaDosFiltros
          />
        </>
      ) : (
        <div className="my-auto flex flex-col gap-3">
          {carregando ? (
            <Carregando texto="Carregando suas viagens..." />
          ) : (
            <>
              {erroCarga && <ErroDeCarga mensagem={erroCarga} onTentar={() => void painel.recarregar()} />}
              {lista.length === 0 && !erroCarga && (
                <EmptyState
                  title={ABAS.find((a) => a.id === aba)!.vazio}
                  description={ABAS.find((a) => a.id === aba)!.dica}
                  className="bg-surface py-14"
                  action={
                    aba === 'agora' && grupos.proximas.length > 0 && (
                      <Button variant="outline" className="min-h-13 text-base" onClick={() => escolher('proximas')}>
                        Ver próximas ({grupos.proximas.length})
                      </Button>
                    )
                  }
                />
              )}
              {lista.slice(0, limite).map((v) => (
                <CartaoViagem key={chaveViagem(v)} viagem={v} painel={painel} />
              ))}
              {lista.length > limite && (
                <Button
                  variant="outline"
                  className={BOTAO_GRANDE}
                  onClick={() => setLimite((n) => n + ITENS_POR_VEZ)}
                >
                  Mostrar mais
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Sempre o mesmo elemento: trocar ou carregar a lista não pode perder um toque nos filtros */}
      <div className="sticky -bottom-3 z-10 -mx-3 mt-auto -mb-3 bg-page-bg px-3 pt-1 pb-3 [@media(max-height:500px)]:static">{filtros}</div>

      <JanelasViagem
        painel={{
          ...painel,
          salvarInicio: async (km, evidenciaId) => {
            await painel.salvarInicio(km, evidenciaId);
            setEscolhida(null);
          },
          salvarFim: async (km, evidenciaId) => {
            await painel.salvarFim(km, evidenciaId);
            setEscolhida(null);
          },
        }}
      />
    </div>
  );
}
