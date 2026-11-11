import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Card,
  IdBadge,
  Avatar,
  Button,
  Table,
  TableToolbar,
  Pagination,
  MetricCard,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import { Clock, Navigation, ParkingSquare, AlertTriangle, Eye } from 'lucide-react';
import type { StatusSolicitacao } from '../types/solicitacao';
import { LABELS_STATUS_SOLICITACAO } from '../types/solicitacao';
import { storageService } from '../services/storageService';

function cnhVencida(validade: string): boolean {
  return new Date(validade) < new Date();
}

function formatarDataHora(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' às ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

function obterBadgeToneStatus(status: StatusSolicitacao): BadgeTone {
  switch (status) {
    case 'APROVADA':
    case 'CONCLUIDA':
      return 'success';
    case 'PENDENTE_APROVACAO':
      return 'warning';
    case 'AGENDADA':
      return 'info';
    case 'RECUSADA':
      return 'danger';
    case 'CANCELADA':
    default:
      return 'neutral';
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();

  // Dados e métricas calculados a partir do cache central (storageService)
  const solicitacoes = useMemo(() => storageService.getSolicitacoes(), []);

  const metricas = useMemo(() => {
    const veiculos = storageService.getVeiculos();
    const motoristas = storageService.getMotoristas();
    const pendentes = solicitacoes.filter((s) => s.status === 'PENDENTE_APROVACAO').length;
    const viagensAtivas = storageService.getViagens().filter((v) => v.status === 'EM_ANDAMENTO').length;

    const veiculosDisponiveis = veiculos.filter((v) => v.status === 'DISPONIVEL');
    const frotaAdmDisponivel = veiculosDisponiveis.filter((v) => v.tipo_frota === 'ADMINISTRATIVA').length;
    const svoDisponivel = veiculosDisponiveis.filter((v) => v.tipo_frota === 'SVO').length;

    const veiculosManutencao = veiculos.filter((v) => v.status === 'MANUTENCAO').length;
    const motoristasCnhVencida = motoristas.filter((m) => cnhVencida(m.validade_cnh)).length;
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
  }, [solicitacoes]);

  return (
    <div className="flex flex-col gap-6">
      {/* ── 4 Cards de Sumário Operacional (Desktop 4 colunas, Tablet 2x2, Mobile 1 coluna) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Solicitações pendentes"
          value={metricas.pendentes}
          tone="warning"
          icon={<Clock size={20} className="text-amber-600" />}
          subtitle="Ação de triagem requerida"
          onClick={() => navigate('/solicitacoes')}
        />

        <MetricCard
          label="Viagens em andamento"
          value={metricas.viagensAtivas}
          tone="info"
          icon={<Navigation size={20} className="text-blue-600" />}
          subtitle="Em deslocamento agora"
          onClick={() => navigate('/viagens')}
        />

        <MetricCard
          label="Veículos no pátio"
          value={metricas.veiculosDisponiveis}
          tone="success"
          icon={<ParkingSquare size={20} className="text-emerald-600" />}
          subtitle={`${metricas.frotaAdmDisponivel} Adm. • ${metricas.svoDisponivel} SVO`}
          onClick={() => navigate('/veiculos')}
        />

        <MetricCard
          label="Alertas da operação"
          value={metricas.alertasCriticos}
          tone="danger"
          icon={<AlertTriangle size={20} className="text-rose-600" />}
          subtitle={`${metricas.veiculosManutencao} manutenção • ${metricas.motoristasCnhVencida} CNH`}
          onClick={() => navigate('/motoristas')}
        />
      </div>

      {/* ── Tabela de Solicitações Recentes ── */}
      <Card className="overflow-hidden">
        <TableToolbar
          title="Solicitações Recentes de Viagem"
          subtitle={`${solicitacoes.length} solicitações registradas no sistema`}
          newLabel="Nova Solicitação"
          onNew={() => navigate('/solicitacoes')}
        />

        <div className="overflow-x-auto min-w-0">
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Solicitante</th>
                <th>Trajeto (Origem → Destino)</th>
                <th>Data Desejada</th>
                <th>Finalidade</th>
                <th>Status</th>
                <th className="text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {solicitacoes.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td>
                    <IdBadge id={`#${s.id}`} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.solicitante_nome} size={28} />
                      <span className="font-semibold text-slate-800 text-xs sm:text-sm">
                        {s.solicitante_nome}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="text-xs font-medium text-slate-800 sm:text-sm">
                      {s.destino}
                    </div>
                    <div className="text-xs text-slate-400">
                      Origem: {s.origem}
                    </div>
                  </td>
                  <td>
                    <span className="text-xs whitespace-nowrap text-slate-500">
                      {formatarDataHora(s.data_saida_desejada)}
                    </span>
                  </td>
                  <td>
                    <span
                      className="block max-w-56 truncate text-xs text-slate-500"
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
                  <td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/solicitacoes')}
                      title="Acompanhar solicitação"
                    >
                      <Eye size={14} className="mr-1" /> Detalhes
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <Pagination showing={`1–${solicitacoes.length}`} total={solicitacoes.length} />
      </Card>
    </div>
  );
}
