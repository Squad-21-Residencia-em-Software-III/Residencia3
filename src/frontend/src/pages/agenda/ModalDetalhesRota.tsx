import { Calendar, Clock, MapPin, Navigation, ShieldCheck, Truck, User } from 'lucide-react';
import { Badge, Modal, type BadgeTone } from '../../components/ui';
import type { RotaAgenda } from '../../types/agenda';
import type { StatusViagem } from '../../types/viagem';

interface ModalDetalhesRotaProps {
  rota: RotaAgenda | null;
  onClose: () => void;
}

function obterBadgeTone(status: StatusViagem): BadgeTone {
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

export function ModalDetalhesRota({ rota, onClose }: ModalDetalhesRotaProps) {
  if (!rota) return null;

  return (
    <Modal
      title={`Detalhes da Viagem #${rota.id}`}
      onClose={onClose}
      confirmLabel="Fechar"
      onConfirm={onClose}
    >
      <div className="flex flex-col gap-5">
        {/* Cabeçalho do trajeto */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <Navigation size={18} color="var(--color-primary)" />
              <span className="text-xs font-bold tracking-[0.05em] text-primary uppercase">
                {rota.tipo_operacao === 'SVO'
                  ? 'Serviço de Verificação de Óbito (SVO)'
                  : 'Frota Administrativa FSPH'}
              </span>
            </div>
            <div className="font-display text-base leading-[1.2] font-extrabold text-text md:text-xl">
              {rota.origem} → {rota.destino}
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm text-text-muted">
              <span className="flex items-center gap-1">
                <Clock size={14} /> {rota.hora_inicio} às {rota.hora_fim}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Calendar size={14} /> {rota.data.split('-').reverse().join('/')}
              </span>
              <span>·</span>
              <span>{rota.km_estimado} km</span>
            </div>
          </div>
          <Badge tone={obterBadgeTone(rota.status)}>
            {rota.status === 'EM_ANDAMENTO'
              ? 'Em Andamento'
              : rota.status === 'CONCLUIDA'
                ? 'Concluída'
                : 'Agendada'}
          </Badge>
        </div>

        {/* Grid de Recursos Alocados (Alinhado com o Banco de Dados) */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
          {/* Veículo */}
          <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] text-text-muted uppercase">
              <Truck size={13} /> Veículo Alocado
            </div>
            <div className="text-sm font-bold text-text">{rota.veiculo_modelo}</div>
            <div className="mt-0.5 flex justify-between text-[11px] text-text-muted">
              <span className="font-mono">Placa: {rota.veiculo_placa}</span>
              <span>Lotação: {rota.capacidade_maxima} vagas</span>
            </div>
          </div>

          {/* Condutor */}
          <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] text-text-muted uppercase">
              <User size={13} /> Condutor Responsável
            </div>
            <div className="text-sm font-bold text-text">{rota.motorista_nome}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">Motorista Oficial FSPH</div>
          </div>

          {/* Solicitante Institucional */}
          <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] text-text-muted uppercase">
              <ShieldCheck size={13} /> Solicitante Institucional
            </div>
            <div className="text-sm font-bold text-text">{rota.solicitante_nome}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">
              Solicitação #{rota.solicitacao_id}
            </div>
          </div>

          {/* Tipo de Frota */}
          <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.05em] text-text-muted uppercase">
              <MapPin size={13} /> Operação
            </div>
            <div className="text-sm font-bold text-text">
              {rota.tipo_operacao === 'SVO' ? 'Operação SVO' : 'Frota Geral'}
            </div>
            <div className="mt-0.5 text-[11px] text-text-muted">Governança RN21</div>
          </div>
        </div>

        {/* Finalidade do Deslocamento */}
        <div className="rounded-lg border border-border bg-[#f8fafc] px-4 py-3">
          <div className="text-[11px] font-bold tracking-[0.05em] text-text-muted uppercase">
            Finalidade Institucional do Deslocamento:
          </div>
          <div className="mt-1 text-sm leading-[1.4] text-text-muted">{rota.finalidade}</div>
        </div>
      </div>
    </Modal>
  );
}
