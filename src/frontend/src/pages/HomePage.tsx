import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Fuel,
  Navigation,
  ParkingSquare,
  Route,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { Button, Card, IdBadge, Badge, MetricCard, PageHeader, Alert } from '../components/ui';
import { dashboardApi, type DashboardData } from '../services/api/dashboardApi';
import { solicitacoesApi } from '../services/api/solicitacoesApi';
import type { NovaSolicitacaoApiInput, SolicitacaoViagem } from '../types/solicitacao';
import { ModalNovaSolicitacao } from './solicitacoes/ModalNovaSolicitacao';
import { cn } from '../utils/cn';

const ATALHOS = [
  {
    id: 'solicitacoes',
    rota: '/solicitacoes',
    icone: Route,
    titulo: 'Nova Solicitação',
    descricao: 'Cadastrar ou analisar pedido',
  },
  {
    id: 'abastecimento',
    rota: '/abastecimento',
    icone: Fuel,
    titulo: 'Registrar Abastecimento',
    descricao: 'Lançar cupom e KM',
  },
  {
    id: 'agenda',
    rota: '/agenda',
    icone: Calendar,
    titulo: 'Ver Agenda',
    descricao: 'Cronograma de saídas',
  },
  {
    id: 'veiculos',
    rota: '/veiculos',
    icone: Truck,
    titulo: 'Gestão de Veículos',
    descricao: 'Pátio e manutenções',
  },
] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const [metricasApi, setMetricasApi] = useState<DashboardData | null>(null);
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<SolicitacaoViagem[]>([]);
  const [modalNovaSolicitacaoAberto, setModalNovaSolicitacaoAberto] = useState(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    try {
      const [metricasData, solicitacoesData] = await Promise.all([
        dashboardApi.consultar().catch(() => null),
        solicitacoesApi.listar('PENDENTE_APROVACAO').catch(() => [] as SolicitacaoViagem[]),
      ]);
      setMetricasApi(metricasData);
      setSolicitacoesPendentes(solicitacoesData);
    } catch {
      // Falha tratada silenciosamente nos promises individuais
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleSalvarNovaSolicitacao = async (nova: NovaSolicitacaoApiInput) => {
    const criada = await solicitacoesApi.criar(nova);
    setMensagemFeedback(`Solicitação #${criada.id} cadastrada com sucesso! Aguardando análise.`);
    carregarDados();
    setTimeout(() => setMensagemFeedback(null), 5000);
  };

  const totalSolicitacoesPendentes =
    metricasApi?.solicitacoes_pendentes ?? solicitacoesPendentes.length;
  const totalViagensAtivas = metricasApi?.viagens_em_andamento ?? 0;
  const veiculosDisponiveis = metricasApi?.veiculos_disponiveis.total ?? 0;
  const frotaAdmDisp = metricasApi?.veiculos_disponiveis.administrativa ?? 0;
  const svoDisp = metricasApi?.veiculos_disponiveis.svo ?? 0;
  const totalAlertas = metricasApi?.alertas.total ?? 0;
  const totalVeiculosManutencao = metricasApi?.alertas.veiculos_em_manutencao ?? 0;
  const totalCnhVencida = metricasApi?.alertas.motoristas_cnh_vencida ?? 0;

  const temCnhIrregular = totalCnhVencida > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header da Central de Operações */}
      <PageHeader
        title="Central de Operações da Frota"
        subtitle="Ações prioritárias para manter veículos liberados e viagens sem atrito."
      />

      {/* Alerta de Feedback de Operações */}
      {mensagemFeedback && (
        <Alert tone="success" className="animate-in fade-in duration-200">
          {mensagemFeedback}
        </Alert>
      )}

      {/* 2. Indicadores Operacionais Executivos (KPIs integrados à API REST) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Solicitações pendentes"
          value={totalSolicitacoesPendentes}
          tone="warning"
          icon={<Clock size={20} className="text-amber-600" />}
          subtitle="Ação de triagem requerida"
          onClick={() => navigate('/solicitacoes')}
        />

        <MetricCard
          label="Viagens em andamento"
          value={totalViagensAtivas}
          tone="info"
          icon={<Navigation size={20} className="text-blue-600" />}
          subtitle="Em deslocamento agora"
          onClick={() => navigate('/viagens')}
        />

        <MetricCard
          label="Veículos no pátio"
          value={veiculosDisponiveis}
          tone="success"
          icon={<ParkingSquare size={20} className="text-emerald-600" />}
          subtitle={`${frotaAdmDisp} Adm. • ${svoDisp} SVO`}
          onClick={() => navigate('/veiculos')}
        />

        <MetricCard
          label="Alertas da operação"
          value={totalAlertas}
          tone="danger"
          icon={<AlertTriangle size={20} className="text-rose-600" />}
          subtitle={`${totalVeiculosManutencao} manutenção • ${totalCnhVencida} CNH`}
          onClick={() => navigate('/veiculos')}
        />
      </div>

      {/* 3. Ações Rápidas (Atalhos Funcionais com Micro-interações) */}
      <div className="flex flex-col">
        <div className="mb-3 text-xs font-bold tracking-wider text-text-muted uppercase">
          Ações Rápidas
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ATALHOS.map((atalho) => {
            const Icone = atalho.icone;
            const handleClick = () => {
              if (atalho.id === 'solicitacoes') {
                setModalNovaSolicitacaoAberto(true);
              } else {
                navigate(atalho.rota);
              }
            };
            return (
              <button
                key={atalho.id}
                type="button"
                onClick={handleClick}
                className="relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-alt active:bg-surface-hover"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icone size={18} />
                </div>
                <div className="min-w-0">
                  <div className="mb-0.5 text-sm font-semibold text-text">
                    {atalho.titulo}
                  </div>
                  <div className="text-xs text-text-muted">
                    {atalho.descricao}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Painéis Principais: Fila de Decisão & Regularidade */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Painel: Fila de Aprovação */}
        <Card className="flex flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-warning" />
              <h2 className="m-0 font-display text-sm font-semibold text-text sm:text-base">
                Fila de Aprovação
              </h2>
            </div>
            <Badge tone={solicitacoesPendentes.length > 0 ? 'warning' : 'neutral'}>
              {solicitacoesPendentes.length} pendente{solicitacoesPendentes.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {solicitacoesPendentes.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-muted">
              <CheckCircle2 size={32} className="mx-auto mb-2 block text-success" />
              <p className="m-0 text-sm font-semibold text-text-strong">Fila limpa</p>
              <span className="text-xs">
                Nenhuma solicitação aguardando despacho no momento.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {solicitacoesPendentes.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-alt p-3 transition-all duration-150 hover:border-border-strong hover:bg-surface hover:shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="mb-0.5 flex items-center gap-2">
                      <IdBadge id={`#${s.id}`} />
                      <strong className="truncate text-xs text-text sm:text-sm">
                        {s.solicitante_nome}
                      </strong>
                    </div>
                    <div className="truncate text-xs text-text-muted">
                      {s.origem} → {s.destino}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 hover:border-primary hover:bg-primary-soft hover:text-primary active:bg-blue-100"
                    onClick={() => navigate('/solicitacoes')}
                  >
                    Analisar
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto border-t border-divider pt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center hover:border-primary hover:bg-primary-soft hover:text-primary active:bg-blue-100"
              onClick={() => navigate('/viagens')}
            >
              Gerenciar Todas as Viagens <ArrowRight size={13} className="ml-1" />
            </Button>
          </div>
        </Card>

        {/* Painel: Bloqueios Operacionais */}
        <Card className="flex flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert
                size={18}
                className={totalAlertas > 0 ? 'text-danger' : 'text-success'}
              />
              <h2 className="m-0 font-display text-sm font-semibold text-text sm:text-base">
                Bloqueios & Regularidade
              </h2>
            </div>
            {totalAlertas > 0 && (
              <Badge tone="danger">{totalAlertas} atenção</Badge>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {/* CNHs */}
            <div
              className={cn(
                'rounded-md border px-4 py-3 transition-all duration-150',
                temCnhIrregular
                  ? 'border-rose-200 bg-danger-soft hover:border-danger hover:shadow-xs'
                  : 'border-border bg-surface-alt hover:border-border-strong hover:bg-surface hover:shadow-xs'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className={cn(
                      'text-xs font-semibold sm:text-sm',
                      temCnhIrregular ? 'text-danger-strong' : 'text-text'
                    )}
                  >
                    Motoristas com CNH Vencida
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {totalCnhVencida === 0
                      ? 'Nenhum condutor com restrição de habilitação.'
                      : `${totalCnhVencida} motorista(s) impedidos de conduzir.`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 hover:border-primary hover:bg-primary-soft hover:text-primary active:bg-blue-100"
                  onClick={() => navigate('/motoristas')}
                >
                  Ver
                </Button>
              </div>
            </div>

            {/* Veículos em Oficina */}
            <div className="rounded-md border border-border bg-surface-alt px-4 py-3 transition-all duration-150 hover:border-border-strong hover:bg-surface hover:shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text sm:text-sm">
                    Veículos em Manutenção
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {totalVeiculosManutencao === 0
                      ? 'Toda a frota operacional ativa no pátio.'
                      : `${totalVeiculosManutencao} veículo(s) retidos para reparo/revisão.`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 hover:border-primary hover:bg-primary-soft hover:text-primary active:bg-blue-100"
                  onClick={() => navigate('/veiculos')}
                >
                  Ver
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-divider pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                Deseja consultar o cronograma de saídas?
              </span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 hover:border-primary hover:bg-primary-soft hover:text-primary active:bg-blue-100"
                onClick={() => navigate('/agenda')}
              >
                Abrir Agenda
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal Reutilizado de Nova Solicitação */}
      {modalNovaSolicitacaoAberto && (
        <ModalNovaSolicitacao
          onClose={() => setModalNovaSolicitacaoAberto(false)}
          onSalvar={handleSalvarNovaSolicitacao}
        />
      )}
    </div>
  );
}
