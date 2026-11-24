import type { ReactNode } from 'react';
import { ChevronRight, CircleDot, Clock, Flag, MapPin, Play } from 'lucide-react';
import { Badge, Button, Card, PlacaMercosul, type BadgeTone } from '../../components/ui';
import { rotuloStatusViagem, viagemEmCurso, type StatusViagem, type Viagem } from '../../types/viagem';
import { cn } from '../../utils/cn';
import { BOTAO_GRANDE, BOTAO_PRINCIPAL } from './comuns';
import { formatarQuando } from './formatarQuando';
import type { ViagensMotorista } from './useViagensMotorista';

const TOM_STATUS: Record<StatusViagem, BadgeTone> = {
  AGENDADA: 'purple',
  EM_ANDAMENTO: 'info',
  NO_LOCAL: 'warning',
  CONCLUIDA: 'success',
  CANCELADA: 'neutral',
};

function horario(v: Viagem): string {
  if (v.status === 'CONCLUIDA' && v.data_hora_efetiva_chegada) {
    return formatarQuando(v.data_hora_efetiva_chegada);
  }
  return formatarQuando(v.data_hora_efetiva_saida ?? v.inicio_previsto);
}

const km = (valor?: number | null) =>
  valor === null || valor === undefined ? null : `${valor.toLocaleString('pt-BR')} km`;

interface CartaoViagemProps {
  viagem: Viagem;
  painel: ViagensMotorista;
  /** Única viagem da tela: ocupa a altura disponível e mostra mais dados. */
  completo?: boolean;
}

/** Cartão da viagem: o essencial no topo (toque abre os detalhes) e um botão principal. */
export function CartaoViagem({ viagem: v, painel, completo = false }: CartaoViagemProps) {
  const { isSvo, podeExecutar, saidaBloqueada, chegadasPendentes } = painel;
  const emCurso = viagemEmCurso(v.status);
  const registrandoChegada = chegadasPendentes.has(v.id);
  const aguardaChegada = isSvo && v.status === 'EM_ANDAMENTO';
  const quando = horario(v);
  const destino = v.destino ?? 'Destino não informado';
  const kmRodados =
    v.km_final !== null && v.km_final !== undefined && v.km_inicial !== null
      ? v.km_final - v.km_inicial
      : null;
  const botao = completo ? BOTAO_PRINCIPAL : BOTAO_GRANDE;

  return (
    <Card
      className={cn(
        'overflow-hidden',
        completo && 'flex flex-1 flex-col',
        // A coleta SVO não tem origem: menos dados, cartão menor
        completo && (v.origem ? 'max-h-[600px]' : 'max-h-[440px]'),
      )}
    >
      <button
        type="button"
        className={cn(
          'block w-full px-4 pt-3 pb-3 text-left active:bg-surface-hover',
          completo && 'flex flex-1 flex-col justify-evenly gap-3 [@media(min-height:600px)]:pt-4',
        )}
        onClick={() => painel.abrirDetalhes(v)}
        aria-label={`Ver detalhes: ${destino}`}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <Badge tone={TOM_STATUS[v.status]}>{rotuloStatusViagem(v)}</Badge>
          {quando && (
            <span className="flex items-center gap-1.5 font-sans text-sm font-semibold text-text-strong">
              <Clock size={15} className="text-neutral" aria-hidden="true" />
              {quando}
            </span>
          )}
        </span>

        {completo ? (
          <Rota origem={v.origem} destino={destino} />
        ) : (
          <span className="mt-2.5 flex items-start gap-2">
            <MapPin size={19} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[17px] leading-snug font-bold wrap-anywhere text-text">
                {destino}
              </span>
              {v.origem && (
                <span className="mt-0.5 block truncate font-sans text-sm text-neutral">
                  Saída de {v.origem}
                </span>
              )}
            </span>
          </span>
        )}

        {completo && <DadosDaViagem viagem={v} kmDoVeiculo={painel.kmDoVeiculo(v.veiculo_id)} />}

        <span className={cn('flex w-full items-center gap-2.5', !completo && 'mt-2.5')}>
          <PlacaMercosul placa={v.veiculo_placa} size={completo ? 'md' : 'sm'} />
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-sans font-medium text-text-strong',
              completo ? 'text-base' : 'text-sm',
            )}
          >
            {v.veiculo_modelo}
          </span>
          {kmRodados !== null && (
            <span className="font-sans text-sm font-semibold text-success">{kmRodados} km</span>
          )}
          <ChevronRight size={20} className="shrink-0 text-text-subtle" aria-hidden="true" />
        </span>

        {v.tipo_operacao === 'ADMINISTRATIVA' && v.material_sensivel && (
          <span className={cn('block font-sans text-sm font-semibold text-warning', !completo && 'mt-2')}>
            Material sensível
          </span>
        )}
      </button>

      {podeExecutar && (v.status === 'AGENDADA' || emCurso) && (
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
          {v.status === 'AGENDADA' && isSvo && v.inicio_previsto && !v.liberada_em && (
            <p className="m-0 text-center text-sm text-neutral">Aguardando liberação</p>
          )}
          {v.status === 'AGENDADA' &&
            (saidaBloqueada ? (
              <p className="m-0 text-center text-sm text-neutral">
                Finalize a viagem atual para iniciar esta.
              </p>
            ) : (
              <Button className={botao} onClick={() => painel.setIniciando(v)}>
                <Play size={20} aria-hidden="true" /> {isSvo ? 'Iniciar coleta' : 'Iniciar viagem'}
              </Button>
            ))}
          {emCurso && (
            <Button
              variant={aguardaChegada ? 'outline' : 'primary'}
              className={aguardaChegada ? BOTAO_GRANDE : botao}
              disabled={registrandoChegada}
              onClick={() => painel.setFinalizando(v)}
            >
              <Flag size={20} aria-hidden="true" /> {isSvo ? 'Finalizar coleta' : 'Finalizar viagem'}
            </Button>
          )}
          {/* A ação esperada fica por último, mais perto do polegar */}
          {aguardaChegada && (
            <Button
              className={botao}
              disabled={registrandoChegada}
              aria-busy={registrandoChegada}
              onClick={() => void painel.registrarChegada(v)}
            >
              <MapPin size={20} aria-hidden="true" />
              {registrandoChegada ? 'Registrando chegada…' : 'Cheguei ao local'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/** Saída e destino ligados por uma linha; na coleta SVO só há o local. */
function Rota({ origem, destino }: { origem: string | null; destino: string }) {
  return (
    <span className="flex w-full flex-col">
      {origem && (
        <>
          <span className="flex items-center gap-3 [@media(max-height:500px)]:hidden">
            <CircleDot size={22} className="shrink-0 text-neutral" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-sans text-sm text-neutral">Saída</span>
              <span className="line-clamp-2 text-base leading-snug font-semibold wrap-anywhere text-text">
                {origem}
              </span>
            </span>
          </span>
          <span className="my-1 ml-2.5 h-5 w-0.5 rounded-full bg-border-strong [@media(max-height:500px)]:hidden" aria-hidden="true" />
        </>
      )}
      <span className="flex items-center gap-3">
        <MapPin size={22} className="shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block font-sans text-sm text-neutral">{origem ? 'Destino' : 'Local'}</span>
          <span className="line-clamp-2 text-xl leading-tight font-bold wrap-anywhere text-text">{destino}</span>
        </span>
      </span>
    </span>
  );
}

/** Só o que a API informa: campo vazio não aparece. Em telas baixas, o essencial já basta. */
function DadosDaViagem({ viagem: v, kmDoVeiculo }: { viagem: Viagem; kmDoVeiculo?: number }) {
  const emCurso = viagemEmCurso(v.status);
  const dados = (
    emCurso
      ? [
          ['Km de saída', km(v.km_inicial)],
          ['Retorno previsto', formatarQuando(v.fim_previsto)],
        ]
      : [
          ['Km do veículo', kmDoVeiculo ? km(kmDoVeiculo) : null],
          ['Retorno previsto', formatarQuando(v.fim_previsto)],
        ]
  ).filter(([, valor]) => valor);

  return (
    <>
      {dados.length > 0 && (
        <span className="hidden w-full auto-cols-fr grid-flow-col gap-2 [@media(min-height:600px)]:grid">
          {dados.map(([rotulo, valor]) => (
            <Dado key={rotulo} rotulo={rotulo!}>
              {valor}
            </Dado>
          ))}
        </span>
      )}
      {(v.solicitante_nome || v.finalidade) && (
        <span className="hidden w-full auto-cols-fr grid-flow-col gap-2 [@media(min-height:700px)]:grid">
          {v.solicitante_nome && <Dado rotulo="Solicitante">{v.solicitante_nome}</Dado>}
          {v.finalidade && <Dado rotulo="Finalidade">{v.finalidade}</Dado>}
        </span>
      )}
    </>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <span className="min-w-0 rounded-md bg-surface-alt px-3 py-2.5">
      <span className="block font-sans text-sm text-neutral">{rotulo}</span>
      <span className="line-clamp-2 text-base leading-snug font-bold wrap-anywhere text-text">{children}</span>
    </span>
  );
}
