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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Cabeçalho do trajeto */}
        <div className="modal-rota-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Navigation size={18} color="var(--color-primary)" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {rota.tipo_operacao === 'SVO' ? 'Serviço de Verificação de Óbito (SVO)' : 'Frota Administrativa FSPH'}
              </span>
            </div>
            <div className="modal-rota-route-title">
              {rota.origem} → {rota.destino}
            </div>
            <div className="modal-rota-meta">
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={14} /> {rota.hora_inicio} às {rota.hora_fim}
              </span>
              <span>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={14} /> {rota.data.split('-').reverse().join('/')}
              </span>
              <span>·</span>
              <span>{rota.km_estimado} km</span>
            </div>
          </div>
          <Badge tone={obterBadgeTone(rota.status)}>
            {rota.status === 'EM_ANDAMENTO' ? 'Em Andamento' : rota.status === 'CONCLUIDA' ? 'Concluída' : 'Agendada'}
          </Badge>
        </div>

        {/* Grid de Recursos Alocados (Alinhado com o Banco de Dados) */}
        <div className="modal-rota-grid">
          {/* Veículo */}
          <div className="modal-rota-card">
            <div className="modal-rota-card__label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Truck size={13} /> Veículo Alocado
            </div>
            <div className="modal-rota-card__value">{rota.veiculo_modelo}</div>
            <div className="modal-rota-card__sub" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>Placa: {rota.veiculo_placa}</span>
              <span>Lotação: {rota.capacidade_maxima} vagas</span>
            </div>
          </div>

          {/* Condutor */}
          <div className="modal-rota-card">
            <div className="modal-rota-card__label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={13} /> Condutor Responsável
            </div>
            <div className="modal-rota-card__value">{rota.motorista_nome}</div>
            <div className="modal-rota-card__sub">Motorista Oficial FSPH</div>
          </div>

          {/* Solicitante Institucional */}
          <div className="modal-rota-card">
            <div className="modal-rota-card__label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={13} /> Solicitante Institucional
            </div>
            <div className="modal-rota-card__value">{rota.solicitante_nome}</div>
            <div className="modal-rota-card__sub">Solicitação #{rota.solicitacao_id}</div>
          </div>

          {/* Tipo de Frota */}
          <div className="modal-rota-card">
            <div className="modal-rota-card__label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={13} /> Operação
            </div>
            <div className="modal-rota-card__value">
              {rota.tipo_operacao === 'SVO' ? 'Operação SVO' : 'Frota Geral'}
            </div>
            <div className="modal-rota-card__sub">Governança RN21</div>
          </div>
        </div>

        {/* Finalidade do Deslocamento */}
        <div className="modal-rota-purpose">
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
            Finalidade Institucional do Deslocamento:
          </div>
          <div className="modal-rota-purpose__text">
            {rota.finalidade}
          </div>
        </div>
      </div>
    </Modal>
  );
}
