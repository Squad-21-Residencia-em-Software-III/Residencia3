import { useEffect, useState } from 'react';
import { Download, Flag, MapPin, Play } from 'lucide-react';
import { Avatar, Badge, Button, Drawer, PlacaMercosul, type BadgeTone } from '../../components/ui';
import { LABELS_STATUS_VIAGEM, type StatusViagem, type Viagem } from '../../types/viagem';

interface DrawerDetalhesViagemProps {
  viagem: Viagem | null;
  onClose: () => void;
  onIniciar?: (viagem: Viagem) => void;
  onFinalizar?: (viagem: Viagem) => void;
  onCancelar?: (viagem: Viagem) => void;
}

function obterBadgeToneStatus(status: StatusViagem): BadgeTone {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'info';
    case 'AGENDADA':
      return 'purple';
    case 'CONCLUIDA':
      return 'success';
    case 'CANCELADA':
    default:
      return 'neutral';
  }
}

function formatarHoraCurta(isoString?: string | null): string {
  if (!isoString) return '—';
  const data = new Date(isoString);
  if (isNaN(data.getTime())) return '—';
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const horas = String(data.getHours()).padStart(2, '0');
  const minutos = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} · ${horas}:${minutos}`;
}

function calcularDuracaoViagem(
  saida?: string | null,
  chegada?: string | null,
): string | null {
  if (!saida || !chegada) return null;
  const dSaida = new Date(saida);
  const dChegada = new Date(chegada);
  const diffMs = dChegada.getTime() - dSaida.getTime();
  if (isNaN(diffMs) || diffMs <= 0) return null;
  const totalMinutos = Math.floor(diffMs / (1000 * 60));
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  if (horas === 0) return `${minutos}min`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h ${minutos}min`;
}

export function DrawerDetalhesViagem({
  viagem: viagemProp,
  onClose,
  onIniciar,
  onFinalizar,
  onCancelar,
}: DrawerDetalhesViagemProps) {
  const [viagemState, setViagemState] = useState<Viagem | null>(viagemProp);

  useEffect(() => {
    if (viagemProp) {
      setViagemState(viagemProp);
    }
  }, [viagemProp]);

  const viagem = viagemProp ?? viagemState;
  if (!viagem) return null;

  const kmRodados =
    viagem.km_final !== null &&
    viagem.km_final !== undefined &&
    viagem.km_inicial !== null
      ? viagem.km_final - viagem.km_inicial
      : null;

  const duracao = calcularDuracaoViagem(
    viagem.data_hora_efetiva_saida,
    viagem.data_hora_efetiva_chegada,
  );

  const dataHoraPartida =
    viagem.data_hora_efetiva_saida ?? viagem.inicio_previsto ?? null;

  const subtitulo = `${
    viagem.tipo_operacao === 'ADMINISTRATIVA'
      ? 'Frota Administrativa'
      : 'Serviço SVO'
  } · Solicitação #${viagem.solicitacao_id}`;

  return (
    <Drawer
      isOpen={Boolean(viagemProp)}
      onClose={onClose}
      width="max-w-[460px]"
      title={
        <div className="flex items-center gap-2.5">
          <span>Viagem #{viagem.id}</span>
          <Badge tone={obterBadgeToneStatus(viagem.status)}>
            {LABELS_STATUS_VIAGEM[viagem.status]}
          </Badge>
        </div>
      }
      subtitle={subtitulo}
      footer={
        <div className="flex items-center justify-between gap-3">
          {viagem.status === 'AGENDADA' && onCancelar ? (
            <Button
              variant="danger-outline"
              size="sm"
              onClick={() => {
                onClose();
                onCancelar(viagem);
              }}
            >
              Cancelar viagem
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Ação mantida como esboço visual de download
              }}
              title="Baixar Ficha da Viagem em PDF"
            >
              <Download size={13} className="mr-1" /> Baixar Ficha
            </Button>

            {viagem.status === 'AGENDADA' && onIniciar && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  onIniciar(viagem);
                }}
              >
                <Play size={13} className="mr-1" /> Iniciar viagem
              </Button>
            )}

            {viagem.status === 'EM_ANDAMENTO' && onFinalizar && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onClose();
                  onFinalizar(viagem);
                }}
              >
                <Flag size={13} className="mr-1" /> Finalizar viagem
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* 1. Card de Partida e Destino (Fundo suave estilizado) */}
        <div className="rounded-2xl border border-blue-100 bg-[#f4f8fe] p-5">
          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <span className="text-[11px] font-bold text-primary tracking-wide">
                Partida
              </span>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
                {formatarHoraCurta(dataHoraPartida)}
              </div>
              {viagem.origem && (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin size={12} className="shrink-0 text-slate-400" />
                  <span className="truncate" title={viagem.origem}>
                    {viagem.origem}
                  </span>
                </div>
              )}
            </div>

            <div className="text-right">
              <span className="text-[11px] font-bold text-primary tracking-wide">
                Destino
              </span>
              <div
                className="mt-1 font-display text-base font-bold text-slate-900 leading-snug line-clamp-2"
                title={viagem.destino ?? '—'}
              >
                {viagem.destino ?? '—'}
              </div>
              {viagem.data_hora_efetiva_chegada && (
                <div className="mt-1 text-xs font-semibold text-emerald-700">
                  Chegada: {formatarHoraCurta(viagem.data_hora_efetiva_chegada)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Equipe e Veículo */}
        <div>
          <h3 className="mb-3 font-display text-xs font-bold tracking-wider text-slate-400 uppercase">
            Equipe e Veículo
          </h3>

          <div className="flex flex-col gap-3.5">
            {/* Motorista */}
            <div className="flex items-center gap-3">
              <Avatar name={viagem.motorista_nome} size={36} />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium leading-none">
                  Motorista
                </div>
                <div className="mt-1 font-display text-sm font-bold text-slate-900 truncate">
                  {viagem.motorista_nome}
                </div>
              </div>
            </div>

            {/* Solicitante */}
            <div className="flex items-center gap-3">
              <Avatar name={viagem.solicitante_nome ?? 'Solicitante'} size={36} />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium leading-none">
                  Solicitante
                </div>
                <div className="mt-1 font-display text-sm font-bold text-slate-900 truncate">
                  {viagem.solicitante_nome ?? '—'}
                </div>
              </div>
            </div>

            {/* Veículo com badge de placa Mercosul estilizada */}
            <div className="flex items-center gap-3">
              <PlacaMercosul placa={viagem.veiculo_placa} />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium leading-none">
                  Veículo
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900 truncate">
                  {viagem.veiculo_modelo}{' '}
                  <span className="font-normal text-slate-400">
                    · Frota Institucional
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Finalidade Institucional (se houver) */}
        {viagem.finalidade && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Finalidade Institucional
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">
              {viagem.finalidade}
            </p>
          </div>
        )}

        <div className="h-px w-full bg-slate-100" />

        {/* 4. Odômetro e Duração */}
        <div>
          <h3 className="mb-3 font-display text-xs font-bold tracking-wider text-slate-400 uppercase">
            Odômetro e Duração
          </h3>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-slate-400">Km inicial</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {viagem.km_inicial !== null
                  ? `${viagem.km_inicial.toLocaleString('pt-BR')} km`
                  : 'Aguardando saída'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Km final</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {viagem.km_final !== null && viagem.km_final !== undefined
                  ? `${viagem.km_final.toLocaleString('pt-BR')} km`
                  : 'Em aberto'}
              </div>
              {kmRodados !== null && (
                <span className="text-[11px] font-bold text-emerald-600">
                  {kmRodados} km rodados
                </span>
              )}
            </div>

            <div>
              <div className="text-xs text-slate-400">Duração</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {duracao
                  ? duracao
                  : viagem.status === 'EM_ANDAMENTO'
                    ? 'Em trânsito'
                    : 'Aguardando partida'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
