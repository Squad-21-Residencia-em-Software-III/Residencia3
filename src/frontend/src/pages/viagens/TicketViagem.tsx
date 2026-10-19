import {
  Car,
  Clock,
  FileText,
  Flag,
  Gauge,
  MapPin,
  Printer,
  User,
  X,
} from 'lucide-react';
import { Avatar, Badge, Button, type BadgeTone } from '../../components/ui';
import {
  LABELS_STATUS_VIAGEM,
  type StatusViagem,
  type Viagem,
} from '../../types/viagem';

interface TicketViagemProps {
  viagem: Viagem;
  onFinalizar?: (viagem: Viagem) => void;
  onRecolher: () => void;
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
  return `${dia}/${mes} às ${horas}:${minutos}`;
}

function calcularDuracaoViagem(saida?: string | null, chegada?: string | null): string | null {
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

export function TicketViagem({ viagem, onFinalizar, onRecolher }: TicketViagemProps) {
  const kmRodados =
    viagem.km_final !== null && viagem.km_final !== undefined
      ? viagem.km_final - viagem.km_inicial
      : null;
  const duracao = calcularDuracaoViagem(viagem.data_hora_efetiva_saida, viagem.data_hora_efetiva_chegada);

  return (
    <div
      style={{
        margin: '6px 0 12px',
        borderRadius: '16px',
        border: '1.5px dashed #cbd5e1',
        background: '#ffffff',
        boxShadow: '0 8px 24px -4px rgba(14, 23, 46, 0.08), 0 2px 6px -1px rgba(14, 23, 46, 0.04)',
        overflow: 'hidden',
        position: 'relative',
        animation: 'ticketFadeIn 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes ticketFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Faixa Superior Limpa e Corporativa */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'var(--color-surface-alt)',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 800,
              color: 'var(--color-primary)',
              background: 'var(--color-primary-soft)',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(21, 84, 184, 0.2)',
            }}
          >
            Viagem #{viagem.id}
          </span>
          <span style={{ color: 'var(--color-border-strong)', fontSize: '13px' }}>•</span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--color-text)',
            }}
          >
            {viagem.tipo_operacao === 'ADMINISTRATIVA' ? 'Frota Administrativa' : 'Serviço SVO'}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            (Solicitação #{viagem.solicitacao_id})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Badge tone={obterBadgeToneStatus(viagem.status)}>
            {LABELS_STATUS_VIAGEM[viagem.status]}
          </Badge>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRecolher();
            }}
            title="Recolher detalhes"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-hover)';
              e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Conteúdo Principal do Ticket (Layout de 2 Colunas com Divisor Perfurado) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          background: 'var(--color-surface)',
        }}
      >
        {/* Lado Esquerdo: Rota Cronológica, Finalidade Contextual e Participantes */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card da Rota Estilo Bilhete (com horários sob cada ponto) */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'var(--color-surface-alt)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
            }}
          >
            {/* Ponto de Origem com horário de saída */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Origem
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={15} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                <span>{viagem.origem}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', paddingLeft: '21px' }}>
                Saída: <strong style={{ color: 'var(--color-text)' }}>{formatarHoraCurta(viagem.data_hora_efetiva_saida)}</strong>
              </div>
            </div>

            {/* Trajeto Visual com Distância */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>PERCURSO</span>
              <div style={{ width: '100%', height: '2px', background: 'var(--color-border)', position: 'relative', margin: '8px 0' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)', position: 'absolute', top: '-2px', left: '0' }} />
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)', position: 'absolute', top: '-2px', right: '0' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)' }}>
                {kmRodados !== null ? `${kmRodados} km` : 'Em aberto'}
              </span>
            </div>

            {/* Ponto de Destino com horário de chegada */}
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Destino
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginTop: '2px' }}>
                {viagem.destino}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Chegada:{' '}
                {viagem.data_hora_efetiva_chegada ? (
                  <strong style={{ color: 'var(--color-text)' }}>{formatarHoraCurta(viagem.data_hora_efetiva_chegada)}</strong>
                ) : viagem.status === 'EM_ANDAMENTO' ? (
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Em trânsito...</span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)' }}>Aguardando saída</span>
                )}
              </div>
            </div>
          </div>

          {/* Grid de 3 Blocos: Motorista, Veículo e Solicitante */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {/* Bloco Motorista */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: '#ffffff',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                <User size={12} /> Motorista Responsável
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Avatar name={viagem.motorista_nome} size={30} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                    {viagem.motorista_nome}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Condutor Oficial FSPH
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco Veículo */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: '#ffffff',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                <Car size={12} /> Veículo Designado
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                    {viagem.veiculo_modelo}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Frota Institucional
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-surface-alt)',
                    border: '1px solid var(--color-border-strong)',
                    color: 'var(--color-text)',
                  }}
                >
                  {viagem.veiculo_placa}
                </span>
              </div>
            </div>

            {/* Bloco Solicitante */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: '#ffffff',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                <FileText size={12} /> Solicitante Institucional
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                  {viagem.solicitante_nome}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Servidor Requisitante
                </div>
              </div>
            </div>
          </div>

          {/* Seção Contextual de Finalidade / Justificativa */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'var(--color-surface-alt)',
              border: '1px dashed var(--color-border-strong)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Justificativa & Finalidade Institucional
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--color-text)', lineHeight: 1.5 }}>
              {viagem.finalidade}
            </div>
          </div>
        </div>

        {/* Lado Direito: Canhoto de Odômetro e Métricas Técnicas */}
        <div
          style={{
            padding: '20px',
            borderLeft: '1.5px dashed var(--color-border-strong)',
            background: 'var(--color-surface-alt)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '16px',
            position: 'relative',
          }}
        >
          {/* Dados de Odômetro */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '10px' }}>
              <Gauge size={12} /> Odômetro / Métricas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Km Inicial:</span>
                <strong style={{ color: 'var(--color-text)', fontFamily: 'monospace' }}>
                  {viagem.km_inicial.toLocaleString('pt-BR')} km
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Km Final:</span>
                <strong style={{ color: 'var(--color-text)', fontFamily: 'monospace' }}>
                  {viagem.km_final ? `${viagem.km_final.toLocaleString('pt-BR')} km` : 'Em aberto'}
                </strong>
              </div>
            </div>
          </div>

          {/* Duração da Viagem */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
              <Clock size={12} /> Duração do Percurso
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
              {duracao ? `⏱️ ${duracao}` : viagem.status === 'EM_ANDAMENTO' ? '⏱️ Em trânsito...' : 'Aguardando partida'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Apuração de tempo de trânsito
            </div>
          </div>

          {/* Ações do Canhoto */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {viagem.status === 'EM_ANDAMENTO' && onFinalizar && (
              <Button
                variant="primary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onFinalizar(viagem);
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Flag size={13} style={{ marginRight: '4px' }} /> Registrar Retorno (Finalizar)
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                // Ação mantida como esboço visual sem disparar download/impressão
              }}
              style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}
              title="Imprimir Manifesto de Viagem"
            >
              <Printer size={13} style={{ marginRight: '4px' }} /> Imprimir Manifesto
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
