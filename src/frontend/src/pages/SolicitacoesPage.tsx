import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  Search,
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
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import type { NovaSolicitacaoInput, SolicitacaoViagem, StatusSolicitacao } from '../types/solicitacao';
import { LABELS_STATUS_SOLICITACAO } from '../types/solicitacao';
import { storageService } from '../services/storageService';
import { ModalAnaliseSolicitacao } from './solicitacoes/ModalAnaliseSolicitacao';
import { ModalNovaSolicitacao } from './solicitacoes/ModalNovaSolicitacao';

type FiltroStatusAba =
  | 'TODAS'
  | 'PENDENTES'
  | 'APROVADAS'
  | 'AGENDADAS'
  | 'CONCLUIDAS'
  | 'RECUSADAS';

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

const cardValor = (cor: string) => ({
  fontSize: '24px',
  fontWeight: 800,
  color: cor,
  fontFamily: 'var(--font-display)',
});
const cardRotulo = { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' };

export default function SolicitacoesPage() {
  const navigate = useNavigate();
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoViagem[]>(() =>
    storageService.getSolicitacoes()
  );
  const [filtroAba, setFiltroAba] = useState<FiltroStatusAba>('TODAS');
  const [busca, setBusca] = useState('');


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

  const recarregar = () => {
    setSolicitacoes(storageService.getSolicitacoes());
  };

  const totais = useMemo(
    () => ({
      total: solicitacoes.length,
      pendentes: solicitacoes.filter((s) => s.status === 'PENDENTE_APROVACAO').length,
      aprovadas: solicitacoes.filter((s) => s.status === 'APROVADA').length,
      agendadas: solicitacoes.filter((s) => s.status === 'AGENDADA').length,
      recusadas: solicitacoes.filter((s) => s.status === 'RECUSADA').length,
      concluidas: solicitacoes.filter((s) => s.status === 'CONCLUIDA').length,
    }),
    [solicitacoes]
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

  // Ações de Decisão
  const handleAprovar = (id: number) => {
    try {
      storageService.aprovarSolicitacao(id);
      recarregar();
      exibirFeedback(`Solicitação #${id} aprovada com sucesso! Liberada para agendamento.`);
    } catch (err: any) {
      exibirFeedback(err.message, true);
    }
  };

  const handleRecusar = (id: number, motivo?: string) => {
    try {
      storageService.recusarSolicitacao(id, motivo);
      recarregar();
      exibirFeedback(`Solicitação #${id} foi recusada.`);
    } catch (err: any) {
      exibirFeedback(err.message, true);
    }
  };

  const handleSalvarNova = (nova: NovaSolicitacaoInput) => {
    try {
      const criada = storageService.createSolicitacao(nova);
      recarregar();
      exibirFeedback(`Solicitação #${criada.id} cadastrada com sucesso! Aguardando análise.`);
    } catch (err: any) {
      exibirFeedback(err.message, true);
    }
  };

  const handleAgendar = (solicitacao: SolicitacaoViagem) => {
    navigate('/viagens', { state: { solicitacaoId: solicitacao.id } });
  };



  return (
    <div style={{ display: 'grid', gap: '20px', minWidth: 0, width: '100%' }}>
      {/* Toast de Feedback */}
      {mensagemSucesso && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--color-success-subtle, #ecfdf5)',
            border: '1px solid var(--color-success-border, #a7f3d0)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-success-text, #065f46)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} /> {mensagemSucesso}
        </div>
      )}

      {mensagemErro && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--color-danger-subtle, #fef2f2)',
            border: '1px solid var(--color-danger-border, #fecaca)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-danger, #b91c1c)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} /> {mensagemErro}
        </div>
      )}

      {/* Cards de Métricas Superiores */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        <Card style={{ padding: '20px' }}>
          <div style={cardValor('var(--color-text)')}>{totais.total}</div>
          <div style={cardRotulo}>Total de Solicitações</div>
        </Card>

        <Card style={{ padding: '20px' }}>
          <div style={cardValor('var(--color-warning, #d97706)')}>
            {totais.pendentes}
          </div>
          <div style={cardRotulo}>Pendentes de Decisão</div>
        </Card>

        <Card style={{ padding: '20px' }}>
          <div style={cardValor('var(--color-success, #059669)')}>
            {totais.aprovadas}
          </div>
          <div style={cardRotulo}>Aprovadas (Aguard. Agendamento)</div>
        </Card>

        <Card style={{ padding: '20px' }}>
          <div style={cardValor('var(--color-primary)')}>
            {totais.agendadas}
          </div>
          <div style={cardRotulo}>Viagens Agendadas</div>
        </Card>

        <Card style={{ padding: '20px' }}>
          <div style={cardValor('var(--color-danger, #dc2626)')}>
            {totais.recusadas}
          </div>
          <div style={cardRotulo}>Solicitações Recusadas</div>
        </Card>
      </div>

      {/* Tabela e Filtros Principais */}
      <Card>
        <TableToolbar
          title="Gestão de Solicitações de Viagem"
          subtitle={`${filtradas.length} de ${solicitacoes.length} solicitações cadastradas no sistema`}
          newLabel="Nova Solicitação"
          onNew={() => setModalNovaAberto(true)}
        />

        {/* Barra de Filtros e Busca */}
        <div style={{ padding: '0 20px 16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Campo de Busca Textual (Esquerda) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                width: '320px',
              }}
            >
              <Search size={14} color="var(--color-text-muted)" style={{ marginRight: '8px', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Buscar por solicitante, trajeto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  width: '100%',
                  color: 'var(--color-text)',
                }}
              />
            </div>

            {/* Dropdown de Filtro de Status */}
            <div style={{ width: '240px' }}>
              <select
                aria-label="Filtrar por status"
                value={filtroAba}
                onChange={(e) => setFiltroAba(e.target.value as FiltroStatusAba)}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '13px',
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="TODAS">Todos os status ({totais.total})</option>
                <option value="PENDENTES">Pendentes de Decisão ({totais.pendentes})</option>
                <option value="APROVADAS">Aprovadas ({totais.aprovadas})</option>
                <option value="AGENDADAS">Agendadas ({totais.agendadas})</option>
                <option value="CONCLUIDAS">Concluídas ({totais.concluidas})</option>
                <option value="RECUSADAS">Recusadas ({totais.recusadas})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabela de Dados */}
        <Table>
          <thead>
            <tr>
              <th style={{ width: '80px' }}>ID</th>
              <th>Solicitante</th>
              <th>Trajeto Solicitado</th>
              <th>Período Pretendido</th>
              <th>Finalidade</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
                  Nenhuma solicitação encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtradas.map((s) => (
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
                    <div style={{ fontSize: '12px', color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                      {formatarDataHora(s.data_saida_desejada)}
                    </div>
                    {s.data_chegada_desejada && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        Retorno: {formatarDataHora(s.data_chegada_desejada)}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--color-text-muted)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
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
                    <Badge tone={obterToneStatus(s.status)}>
                      {LABELS_STATUS_SOLICITACAO[s.status]}
                    </Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>
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
                        style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                        onClick={() => handleAgendar(s)}
                      >
                        Agendar <ArrowRight size={12} style={{ marginLeft: '4px' }} />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSolicitacaoEmAnalise(s)}
                      >
                        <Eye size={14} style={{ marginRight: '4px' }} /> Detalhes
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
