import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye } from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  FilterSelect,
  IdBadge,
  MetricCard,
  Pagination,
  SearchInput,
  Table,
  TableFilterCollapse,
  TableToolbar,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { mensagemDeErro } from '../services/api/http';
import { solicitacoesApi } from '../services/api/solicitacoesApi';
import type {
  NovaSolicitacaoApiInput,
  SolicitacaoViagem,
  StatusSolicitacao,
} from '../types/solicitacao';
import { LABELS_STATUS_SOLICITACAO } from '../types/solicitacao';
import { PERFIS } from '../types/usuario';
import { ModalAnaliseSolicitacao } from './solicitacoes/ModalAnaliseSolicitacao';
import { ModalNovaSolicitacao } from './solicitacoes/ModalNovaSolicitacao';

type FiltroStatusAba =
  'TODAS' | 'PENDENTES' | 'APROVADAS' | 'AGENDADAS' | 'CONCLUIDAS' | 'RECUSADAS';

function obterToneStatus(status: StatusSolicitacao): BadgeTone {
  switch (status) {
    case 'PENDENTE_APROVACAO':
      return 'warning';
    case 'APROVADA':
    case 'CONCLUIDA':
      return 'success';
    case 'AGENDADA':
      return 'info';
    case 'RECUSADA':
      return 'danger';
    case 'CANCELADA':
    default:
      return 'neutral';
  }
}

function formatarDataHora(iso?: string | null): string {
  if (!iso) return 'N/D';
  try {
    const data = new Date(iso);
    if (isNaN(data.getTime())) return iso;
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    const horas = String(data.getHours()).padStart(2, '0');
    const minutos = String(data.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
  } catch {
    return iso;
  }
}

export default function SolicitacoesPage() {
  const navigate = useNavigate();
  const { temPerfil } = useAuth();
  // A API só libera a listagem para quem analisa solicitações
  const podeListar = temPerfil(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO);

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoViagem[]>([]);
  const [carregando, setCarregando] = useState(podeListar);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [filtroAba, setFiltroAba] = useState<FiltroStatusAba>('TODAS');
  const [busca, setBusca] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [modalNovaAberto, setModalNovaAberto] = useState(false);
  const [solicitacaoEmAnalise, setSolicitacaoEmAnalise] = useState<SolicitacaoViagem | null>(null);

  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const exibirFeedback = (msg: string, isError = false) => {
    if (isError) {
      setMensagemErro(msg);
      setMensagemSucesso(null);
    } else {
      setMensagemSucesso(msg);
      setMensagemErro(null);
    }
    setTimeout(() => {
      setMensagemSucesso(null);
      setMensagemErro(null);
    }, 4000);
  };

  const recarregar = useCallback(async () => {
    if (!podeListar) return;
    try {
      setSolicitacoes(await solicitacoesApi.listar());
      setErroCarga(null);
    } catch (error) {
      setErroCarga(mensagemDeErro(error));
    } finally {
      setCarregando(false);
    }
  }, [podeListar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const totais = useMemo(
    () => ({
      total: solicitacoes.length,
      pendentes: solicitacoes.filter((s) => s.status === 'PENDENTE_APROVACAO').length,
      aprovadas: solicitacoes.filter((s) => s.status === 'APROVADA').length,
      agendadas: solicitacoes.filter((s) => s.status === 'AGENDADA').length,
      recusadas: solicitacoes.filter((s) => s.status === 'RECUSADA').length,
      concluidas: solicitacoes.filter((s) => s.status === 'CONCLUIDA').length,
    }),
    [solicitacoes],
  );

  const filtradas = useMemo(() => {
    return solicitacoes.filter((s) => {
      if (filtroAba === 'PENDENTES' && s.status !== 'PENDENTE_APROVACAO') return false;
      if (filtroAba === 'APROVADAS' && s.status !== 'APROVADA') return false;
      if (filtroAba === 'AGENDADAS' && s.status !== 'AGENDADA') return false;
      if (filtroAba === 'RECUSADAS' && s.status !== 'RECUSADA') return false;
      if (filtroAba === 'CONCLUIDAS' && s.status !== 'CONCLUIDA') return false;

      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const bateNome = s.solicitante_nome.toLowerCase().includes(termo);
        const bateOrigem = s.origem.toLowerCase().includes(termo);
        const bateDestino = s.destino.toLowerCase().includes(termo);
        const bateFinalidade = s.finalidade.toLowerCase().includes(termo);
        const bateId = String(s.id).includes(termo);
        if (!bateNome && !bateOrigem && !bateDestino && !bateFinalidade && !bateId) {
          return false;
        }
      }
      return true;
    });
  }, [solicitacoes, filtroAba, busca]);

  // Ações de Decisão: os erros da API são exibidos dentro do modal que disparou a ação
  const handleAprovar = async (id: number) => {
    await solicitacoesApi.aprovar(id);
    await recarregar();
    exibirFeedback(`Solicitação #${id} aprovada com sucesso! Liberada para agendamento.`);
  };

  const handleRecusar = async (id: number, motivo?: string) => {
    await solicitacoesApi.recusar(id, motivo);
    await recarregar();
    exibirFeedback(`Solicitação #${id} foi recusada.`);
  };

  const handleSalvarNova = async (nova: NovaSolicitacaoApiInput) => {
    const criada = await solicitacoesApi.criar(nova);
    await recarregar();
    exibirFeedback(`Solicitação #${criada.id} cadastrada com sucesso! Aguardando análise.`);
  };

  const mensagemTabela = !podeListar
    ? 'A consulta das suas solicitações ainda não está disponível. Use "Nova Solicitação" para registrar um pedido.'
    : carregando
      ? 'Carregando solicitações...'
      : (erroCarga ?? 'Nenhuma solicitação encontrada para os filtros selecionados.');

  const handleAgendar = (solicitacao: SolicitacaoViagem) => {
    navigate('/viagens', { state: { solicitacaoId: solicitacao.id } });
  };

  return (
    <div className="grid w-full min-w-0 gap-5">
      {/* Toast de Feedback */}
      {mensagemSucesso && <Alert tone="success">{mensagemSucesso}</Alert>}

      {mensagemErro && <Alert tone="danger">{mensagemErro}</Alert>}

      {/* Cards de Métricas Superiores */}
      {podeListar && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <MetricCard label="Total de Solicitações" value={totais.total} tone="neutral" />

          <MetricCard label="Pendentes de Decisão" value={totais.pendentes} tone="warning" />

          <MetricCard
            label="Aprovadas (Aguard. Agendamento)"
            value={totais.aprovadas}
            tone="success"
          />

          <MetricCard label="Viagens Agendadas" value={totais.agendadas} tone="primary" />

          <MetricCard
            label="Solicitações Recusadas"
            value={totais.recusadas}
            tone="danger"
            className="col-span-2 lg:col-span-1"
          />
        </div>
      )}

      {/* Tabela e Filtros Principais */}
      <Card>
        <TableToolbar
          title="Gestão de Solicitações de Viagem"
          subtitle={`${filtradas.length} de ${solicitacoes.length} solicitações cadastradas no sistema`}
          newLabel="Nova Solicitação"
          onNew={() => setModalNovaAberto(true)}
          onFilter={() => setFiltrosAbertos((f) => !f)}
          isFilterActive={filtroAba !== 'TODAS' || Boolean(busca) || filtrosAbertos}
        />

        {/* Barra de Filtros e Busca */}
        <TableFilterCollapse isOpen={filtrosAbertos}>
          {/* Busca textual na esquerda */}
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por solicitante, trajeto..."
          />

          {/* Dropdown de status na sequência */}
          <FilterSelect
            aria-label="Filtrar por status"
            value={filtroAba}
            onChange={(val) => setFiltroAba(val as FiltroStatusAba)}
            options={[
              { value: 'TODAS', label: `Todos os status (${totais.total})` },
              { value: 'PENDENTES', label: `Pendentes de Decisão (${totais.pendentes})` },
              { value: 'APROVADAS', label: `Aprovadas (${totais.aprovadas})` },
              { value: 'AGENDADAS', label: `Agendadas (${totais.agendadas})` },
              { value: 'CONCLUIDAS', label: `Concluídas (${totais.concluidas})` },
              { value: 'RECUSADAS', label: `Recusadas (${totais.recusadas})` },
            ]}
          />

          {(filtroAba !== 'TODAS' || busca) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca('');
                setFiltroAba('TODAS');
              }}
            >
              Limpar
            </Button>
          )}
        </TableFilterCollapse>

        {/* Tabela de Dados */}
        <Table>
          <thead>
            <tr>
              <th className="w-20">ID</th>
              <th>Solicitante</th>
              <th>Trajeto Solicitado</th>
              <th>Período Pretendido</th>
              <th>Finalidade</th>
              <th>Status</th>
              <th className="text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-9 text-center text-slate-500">
                  {mensagemTabela}
                </td>
              </tr>
            ) : (
              filtradas.map((s) => (
                <tr key={s.id}>
                  <td>
                    <IdBadge id={`#${s.id}`} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.solicitante_nome} size={28} />
                      <div>
                        <div className="text-[13px] font-semibold text-slate-900">
                          {s.solicitante_nome}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {s.unidade_nome ?? 'Sem unidade'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="text-[13px] font-medium text-slate-900">{s.destino}</div>
                    <div className="text-[11px] text-slate-500">Origem: {s.origem}</div>
                  </td>
                  <td>
                    <div className="text-xs whitespace-nowrap text-slate-900">
                      {formatarDataHora(s.data_saida_desejada)}
                    </div>
                    {s.data_chegada_desejada && (
                      <div className="text-[11px] whitespace-nowrap text-slate-500">
                        Retorno: {formatarDataHora(s.data_chegada_desejada)}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className="line-clamp-2 max-w-[280px] text-xs text-slate-500"
                      title={s.finalidade}
                    >
                      {s.finalidade}
                    </span>
                  </td>
                  <td>
                    <Badge tone={obterToneStatus(s.status)}>
                      {LABELS_STATUS_SOLICITACAO[s.status]}
                    </Badge>
                  </td>
                  <td className="text-right">
                    {s.status === 'PENDENTE_APROVACAO' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setSolicitacaoEmAnalise(s)}
                      >
                        Analisar
                      </Button>
                    ) : s.status === 'APROVADA' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-primary text-primary hover:bg-primary-soft"
                        onClick={() => handleAgendar(s)}
                      >
                        Agendar <ArrowRight size={12} className="ml-1" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSolicitacaoEmAnalise(s)}
                      >
                        <Eye size={14} className="mr-1" /> Detalhes
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${filtradas.length}`} total={filtradas.length} />
      </Card>

      {/* Modal de Análise e Decisão (SCRUM-72 / SCRUM-73 / SCRUM-74) */}
      {solicitacaoEmAnalise && (
        <ModalAnaliseSolicitacao
          solicitacao={solicitacaoEmAnalise}
          onClose={() => setSolicitacaoEmAnalise(null)}
          onAprovar={handleAprovar}
          onRecusar={handleRecusar}
          onAgendar={handleAgendar}
        />
      )}

      {/* Modal de Nova Solicitação */}
      {modalNovaAberto && (
        <ModalNovaSolicitacao
          onClose={() => setModalNovaAberto(false)}
          onSalvar={handleSalvarNova}
        />
      )}
    </div>
  );
}
