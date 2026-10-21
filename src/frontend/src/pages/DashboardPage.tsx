import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  Clock,
  Eye,
  ParkingSquare,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  IdBadge,
  Pagination,
  Table,
  TableToolbar,
  type BadgeTone,
} from '../components/ui';
import { MOCK_VEICULOS } from '../services/mocks/veiculosMock';
import { MOCK_MOTORISTAS } from '../services/mocks/motoristasMock';
import {
  MOCK_SOLICITACOES,
  MOCK_VIAGENS_ATIVAS,
} from '../services/mocks/solicitacoesMock';
import {
  LABELS_STATUS_SOLICITACAO,
  type StatusSolicitacao,
} from '../types/solicitacao';

function cnhVencida(validade: string): boolean {
  return validade < new Date().toISOString().slice(0, 10);
}

function formatarDataHora(isoString: string): string {
  const data = new Date(isoString);
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  const horas = String(data.getHours()).padStart(2, '0');
  const minutos = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} às ${horas}:${minutos}`;
}

function obterBadgeToneStatus(status: StatusSolicitacao): BadgeTone {
  switch (status) {
    case 'PENDENTE_APROVACAO':
      return 'warning';
    case 'APROVADA':
      return 'success';
    case 'REJEITADA':
      return 'danger';
    case 'CANCELADA':
    default:
      return 'neutral';
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();

  // Métricas dinâmicas calculadas a partir dos dados do banco/mocks
  const metricas = useMemo(() => {
    const pendentes = MOCK_SOLICITACOES.filter((s) => s.status === 'PENDENTE_APROVACAO').length;
    const viagensAtivas = MOCK_VIAGENS_ATIVAS.length;

    const veiculosDisponiveis = MOCK_VEICULOS.filter((v) => v.status === 'DISPONIVEL');
    const frotaAdmDisponivel = veiculosDisponiveis.filter((v) => v.tipo_frota === 'ADMINISTRATIVA').length;
    const svoDisponivel = veiculosDisponiveis.filter((v) => v.tipo_frota === 'SVO').length;

    const veiculosManutencao = MOCK_VEICULOS.filter((v) => v.status === 'MANUTENCAO').length;
    const motoristasCnhVencida = MOCK_MOTORISTAS.filter((m) => cnhVencida(m.validade_cnh)).length;
    const alertasCriticos = veiculosManutencao + motoristasCnhVencida;

    return {
      pendentes,
      viagensAtivas,
      veiculosDisponiveis: veiculosDisponiveis.length,
      frotaAdmDisponivel,
      svoDisponivel,
      veiculosManutencao,
      motoristasCnhVencida,
      alertasCriticos,
    };
  }, []);

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* 4 Cards de Sumário Operacional com ícones do Lucide */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
        {/* Card 1: Solicitações Pendentes */}
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#FFF7ED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={20} color="#E66A12" strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: 'var(--color-warning)',
                  fontFamily: 'var(--font-display)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {metricas.pendentes}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Solicitações pendentes
              </div>
            </div>
            {metricas.pendentes > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: '#FEF3C7',
                  color: '#B45309',
                }}
              >
                Ação Gestor
              </span>
            )}
          </div>
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-alt)',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Última recebida há pouco
            </span>
            <button
              onClick={() => navigate('/viagens')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-warning)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Revisar solicitações <ArrowRight size={13} />
            </button>
          </div>
        </Card>

        {/* Card 2: Viagens em Andamento */}
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 20px 12px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Car size={20} color="#1D4ED8" strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: 'var(--color-primary)',
                  fontFamily: 'var(--font-display)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {metricas.viagensAtivas}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Viagens em andamento
              </div>
            </div>
          </div>
          <div style={{ padding: '0 20px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {MOCK_VIAGENS_ATIVAS.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--color-text)',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{item.hora}</span>
                <span style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.origem} → {item.destino}
                </span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', flexShrink: 0 }}>
                  ({item.veiculo_modelo})
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-alt)',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={() => navigate('/viagens')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Ver viagens ativas <ArrowRight size={13} />
            </button>
          </div>
        </Card>

        {/* Card 3: Veículos no Pátio (Disponíveis) */}
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 20px 14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#DCFCE7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ParkingSquare size={20} color="#15803D" strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: 'var(--color-success)',
                  fontFamily: 'var(--font-display)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {metricas.veiculosDisponiveis}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Veículos disponíveis no pátio
              </div>
            </div>
            <Badge tone="success">Prontos</Badge>
          </div>
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-alt)',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#DCFCE7',
                  color: '#15803D',
                }}
              >
                {metricas.frotaAdmDisponivel} Frota Adm.
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#EDE9FE',
                  color: '#6D28D9',
                }}
              >
                {metricas.svoDisponivel} SVO
              </span>
            </div>
            <button
              onClick={() => navigate('/veiculos')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-success)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Ver frota <ArrowRight size={13} />
            </button>
          </div>
        </Card>

        {/* Card 4: Alertas da Operação */}
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 20px 14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#FEF2F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} color="#DC2626" strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  color: 'var(--color-danger)',
                  fontFamily: 'var(--font-display)',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {metricas.alertasCriticos}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Alertas da operação
              </div>
            </div>
            {metricas.alertasCriticos > 0 && <Badge tone="danger">Atenção</Badge>}
          </div>
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-alt)',
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {metricas.veiculosManutencao} em manutenção • {metricas.motoristasCnhVencida} CNH vencida
            </span>
            <button
              onClick={() => navigate('/motoristas')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-danger)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Ver motoristas <ArrowRight size={13} />
            </button>
          </div>
        </Card>
      </div>

      {/* Tabela de Solicitações Recentes */}
      <Card>
        <TableToolbar
          title="Solicitações Recentes de Viagem"
          subtitle={`${MOCK_SOLICITACOES.length} solicitações registradas no sistema`}
          newLabel="Nova Solicitação"
          onNew={() => navigate('/viagens')}
        />

        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Solicitante</th>
              <th>Trajeto (Origem → Destino)</th>
              <th>Data Desejada</th>
              <th>Finalidade</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_SOLICITACOES.map((s) => (
              <tr key={s.id}>
                <td>
                  <IdBadge id={`#${s.id}`} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar name={s.solicitante_nome} size={28} />
                    <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '13px' }}>
                      {s.solicitante_nome}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: 500 }}>
                    {s.destino}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Origem: {s.origem}
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {formatarDataHora(s.data_saida_desejada)}
                  </span>
                </td>
                <td>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-text-muted)',
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      maxWidth: '280px',
                    }}
                    title={s.finalidade}
                  >
                    {s.finalidade}
                  </span>
                </td>
                <td>
                  <Badge tone={obterBadgeToneStatus(s.status)}>
                    {LABELS_STATUS_SOLICITACAO[s.status]}
                  </Badge>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/viagens')}
                    title="Acompanhar solicitação"
                  >
                    <Eye size={14} style={{ marginRight: '4px' }} /> Detalhes
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        <Pagination showing={`1–${MOCK_SOLICITACOES.length}`} total={MOCK_SOLICITACOES.length} />
      </Card>
    </div>
  );
}
