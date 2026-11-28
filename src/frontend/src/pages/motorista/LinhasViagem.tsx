import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui';
import { chaveViagem, type Viagem } from '../../types/viagem';
import { formatarQuando } from './formatarQuando';

interface LinhasViagemProps {
  titulo: string;
  viagens: Viagem[];
  onAbrir: (viagem: Viagem) => void;
  rodape?: ReactNode;
}

/** Viagens em linhas curtas; o toque abre os detalhes, com as ações embaixo. */
export function LinhasViagem({ titulo, viagens, onAbrir, rodape }: LinhasViagemProps) {
  return (
    <section aria-label={titulo}>
      <h2 className="mb-2 px-1 text-[0.9375rem] font-bold">{titulo}</h2>
      <Card className="overflow-hidden">
        <ul className="m-0 list-none divide-y divide-divider p-0">
          {viagens.map((v) => (
            <li key={chaveViagem(v)}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-hover [@media(min-height:700px)]:min-h-16"
                onClick={() => onAbrir(v)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold text-text">
                    {v.destino ?? 'Destino não informado'}
                  </span>
                  <span className="block truncate font-sans text-sm text-neutral">
                    {[
                      formatarQuando(v.data_hora_efetiva_chegada ?? v.data_hora_efetiva_saida ?? v.inicio_previsto),
                      v.veiculo_placa,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-text-subtle" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {rodape}
      </Card>
    </section>
  );
}
