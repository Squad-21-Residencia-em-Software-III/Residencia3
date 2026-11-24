import type { ReactNode } from 'react';
import { chaveViagem, type Viagem } from '../../types/viagem';
import { cn } from '../../utils/cn';
import { CartaoViagem } from './CartaoViagem';
import { LinhasViagem } from './LinhasViagem';
import type { ViagensMotorista } from './useViagensMotorista';

interface ProximaEDepoisProps {
  painel: ViagensMotorista;
  titulo: string;
  destaque: Viagem[];
  tituloDepois?: string;
  depois?: Viagem[];
  /** Ação no fim da lista do que vem depois. */
  rodapeDepois?: ReactNode;
  /** Há filtros fixos embaixo: o destaque para logo acima deles. */
  acimaDosFiltros?: boolean;
}

/**
 * O destaque fica por último, para a ação do momento estar ao alcance do polegar. Sozinho na tela,
 * o cartão cresce e mostra mais dados; com outras viagens, elas ficam em cima, em linhas curtas.
 */
export function ProximaEDepois({
  painel, titulo, destaque, tituloDepois = '', depois = [], rodapeDepois, acimaDosFiltros = false,
}: ProximaEDepoisProps) {
  // Vários em andamento (coletas SVO juntas) não caberiam fixos na tela
  const fixo = destaque.length === 1;
  const sozinho = fixo && depois.length === 0;

  const secaoDestaque = (
    <section
      className={cn('flex flex-col gap-2.5', sozinho && 'flex-1 justify-center')}
      aria-label={titulo}
    >
      <h2 className="px-1 text-[15px] font-bold">{titulo}</h2>
      {destaque.map((v) => (
        <CartaoViagem key={chaveViagem(v)} viagem={v} painel={painel} completo={sozinho} />
      ))}
    </section>
  );

  return (
    <>
      {!sozinho && (
        <div className="my-auto flex flex-col gap-3 [@media(max-height:500px)]:order-last">
          {depois.length > 0 && (
            <LinhasViagem
              titulo={tituloDepois}
              viagens={depois}
              onAbrir={painel.abrirDetalhes}
              rodape={rodapeDepois}
            />
          )}
          {!fixo && secaoDestaque}
        </div>
      )}

      {fixo && (
        <div
          className={cn(
            'sticky z-10 -mx-3 flex flex-col bg-page-bg px-3 pt-1 [@media(max-height:500px)]:static',
            acimaDosFiltros ? 'bottom-[52px]' : '-bottom-3 -mb-3 pb-3',
            sozinho && 'flex-1',
          )}
        >
          {secaoDestaque}
        </div>
      )}
    </>
  );
}
