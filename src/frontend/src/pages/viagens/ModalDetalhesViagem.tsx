import {
  Calendar,
  Car,
  Clock,
  Gauge,
  MapPin,
  User,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Modal,
  type BadgeTone,
} from '../../components/ui';
import {
  LABELS_STATUS_VIAGEM,
  type StatusViagem,
  type Viagem,
} from '../../types/viagem';

interface ModalDetalhesViagemProps {
  viagem: Viagem;
  onClose: () => void;
  onFinalizar?: (viagem: Viagem) => void;
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

function formatarDataHora(isoString?: string | null): string {
  if (!isoString) return '—';
  const data = new Date(isoString);
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  const horas = String(data.getHours()).padStart(2, '0');
  const minutos = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} às ${horas}:${minutos}`;
}

export function ModalDetalhesViagem({ viagem, onClose, onFinalizar }: ModalDetalhesViagemProps) {
  const kmRodados =
    viagem.km_final !== null && viagem.km_final !== undefined
      ? viagem.km_final - viagem.km_inicial
      : null;

  return (
    <Modal title={`Detalhes da Viagem #${viagem.id}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Cabeçalho do Trajeto */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                background: viagem.tipo_operacao === 'ADMINISTRATIVA' ? '#EFF6FF' : '#F5F3FF',
                color: viagem.tipo_operacao === 'ADMINISTRATIVA' ? '#1D4ED8' : '#6D28D9',
              }}
            >
              {viagem.tipo_operacao === 'ADMINISTRATIVA' ? 'Frota Administrativa' : 'Serviço SVO'}
            </span>
            <Badge tone={obterBadgeToneStatus(viagem.status)}>
              {LABELS_STATUS_VIAGEM[viagem.status]}
            </Badge>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <MapPin size={18} color="var(--color-primary)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}>
                {viagem.origem} → {viagem.destino}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Solicitação vinculada: #{viagem.solicitacao_id}
              </div>
            </div>
          </div>
        </div>

        {/* Motorista e Veículo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={13} /> Motorista Responsável
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Avatar name={viagem.motorista_nome} size={32} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                  {viagem.motorista_nome}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Condutor da Operação
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Car size={13} /> Veículo Designado
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                {viagem.veiculo_modelo}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                {viagem.veiculo_placa}
              </div>
            </div>
          </div>
        </div>

        {/* Quilometragem e Odômetro */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface-alt)',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Gauge size={13} /> Controle de Odômetro (Banco de Dados)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Km Inicial (Saída)</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text)', marginTop: '2px' }}>
                {viagem.km_inicial.toLocaleString('pt-BR')} km
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Km Final (Retorno)</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text)', marginTop: '2px' }}>
                {viagem.km_final ? `${viagem.km_final.toLocaleString('pt-BR')} km` : 'Em andamento'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Distância Percorrida</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '2px' }}>
                {kmRodados !== null ? `${kmRodados} km` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Horários e Finalidade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} /> <strong>Saída:</strong> {formatarDataHora(viagem.data_hora_efetiva_saida)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} /> <strong>Chegada:</strong> {formatarDataHora(viagem.data_hora_efetiva_chegada)}
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Solicitante Institucional & Finalidade
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
            {viagem.solicitante_nome}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
            {viagem.finalidade}
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Fechar
          </Button>
          {viagem.status === 'EM_ANDAMENTO' && onFinalizar && (
            <Button
              type="button"
              onClick={() => {
                onClose();
                onFinalizar(viagem);
              }}
            >
              Registrar Retorno (Finalizar)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
