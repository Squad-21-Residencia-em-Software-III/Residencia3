import { useMemo, useState } from 'react';
import { Avatar, Badge, Card, IdBadge, Pagination, Table, TableFilterCollapse, TableToolbar } from '../components/ui';
import type { BadgeTone } from '../components/ui';
import type { Motorista, StatusMotorista, TipoMotorista } from '../types/motorista';
import { storageService } from '../services/storageService';
import { ModalMotorista } from './motoristas/ModalMotorista';

type FiltroTipo = 'TODOS' | TipoMotorista;
type FiltroStatus = 'TODOS' | StatusMotorista;

// Status é definido pelo backend (sincronização com viagens); a tela apenas exibe.
const STATUS_MAP: Record<StatusMotorista, { label: string; tone: BadgeTone; cor: string }> = {
  DISPONIVEL: { label: 'Disponível', tone: 'success', cor: 'var(--color-success)' },
  DESIGNADO: { label: 'Designado', tone: 'warning', cor: 'var(--color-warning)' },
  EM_VIAGEM: { label: 'Em Viagem', tone: 'info', cor: 'var(--color-primary)' },
  AFASTADO: { label: 'Afastado', tone: 'danger', cor: 'var(--color-danger)' },
  INATIVO: { label: 'Inativo', tone: 'neutral', cor: 'var(--color-text-muted)' },
};

function cnhVencida(validade: string) {
  return validade < new Date().toISOString().slice(0, 10);
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

const cardValor = (cor: string) => ({
  fontSize: '24px',
  fontWeight: 800,
  color: cor,
  fontFamily: 'var(--font-display)',
});
const cardRotulo = { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' };

export default function MotoristasPage() {
  const [motoristas, setMotoristas] = useState<Motorista[]>(storageService.getMotoristas());
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
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

  const totais = useMemo(
    () => ({
      total: motoristas.length,
      disponiveis: motoristas.filter((m) => m.status === 'DISPONIVEL').length,
      designados: motoristas.filter((m) => m.status === 'DESIGNADO').length,
      emViagem: motoristas.filter((m) => m.status === 'EM_VIAGEM').length,
      vencidas: motoristas.filter((m) => cnhVencida(m.validade_cnh)).length,
    }),
    [motoristas],
  );

  const filtrados = useMemo(
    () =>
      motoristas.filter((m) => {
        const bateTipo = filtroTipo === 'TODOS' || m.tipo_motorista === filtroTipo;
        const bateStatus = filtroStatus === 'TODOS' || m.status === filtroStatus;
        return bateTipo && bateStatus;
      }),
    [motoristas, filtroTipo, filtroStatus],
  );

  const handleSalvar = (novo: Omit<Motorista, 'id' | 'usuario_id'>) => {
    try {
      storageService.createMotorista(novo);
      setMotoristas(storageService.getMotoristas());
      exibirFeedback(`Motorista ${novo.nome} cadastrado com sucesso!`);
    } catch (error: any) {
      exibirFeedback(error.message, true);
    }
  };

  const botaoFiltro = (ativo: boolean, cor = 'var(--color-primary)') => ({
    padding: '6px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '12px',
    fontWeight: 600,
    background: ativo ? cor : 'transparent',
    color: ativo ? '#fff' : 'var(--color-text-secondary)',
    border: '1px solid',
    borderColor: ativo ? cor : 'var(--color-border)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });

  const cardFiltro = (status: StatusMotorista) => ({
    padding: '16px 20px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: filtroStatus === status ? `2px solid ${STATUS_MAP[status].cor}` : '1px solid var(--color-border)',
    boxShadow: filtroStatus === status ? 'var(--shadow-sm)' : undefined,
  });

  const alternarStatus = (status: StatusMotorista) =>
    setFiltroStatus(filtroStatus === status ? 'TODOS' : status);

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Feedback de sucesso e erro */}
      {(mensagemSucesso || mensagemErro) && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            border: `1px solid ${mensagemErro ? 'var(--color-danger)' : 'var(--color-success)'}`,
            color: mensagemErro ? 'var(--color-danger)' : 'var(--color-success)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mensagemErro ? '❌' : '✅'} {mensagemErro || mensagemSucesso}
          </span>
        </div>
      )}

      {/* ── Cards de Resumo (Clicáveis como Filtros Rápidos) ── */}
      <div className="kpi-grid">
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-text)')}>{totais.total}</div>
          <div style={cardRotulo}>Total de Motoristas</div>
        </Card>
        <Card onClick={() => alternarStatus('DISPONIVEL')} style={cardFiltro('DISPONIVEL')}>
          <div style={cardValor(STATUS_MAP.DISPONIVEL.cor)}>{totais.disponiveis}</div>
          <div style={cardRotulo}>Disponíveis {filtroStatus === 'DISPONIVEL' ? '• Ativo' : ''}</div>
        </Card>
        <Card onClick={() => alternarStatus('DESIGNADO')} style={cardFiltro('DESIGNADO')}>
          <div style={cardValor(STATUS_MAP.DESIGNADO.cor)}>{totais.designados}</div>
          <div style={cardRotulo}>Designados {filtroStatus === 'DESIGNADO' ? '• Ativo' : ''}</div>
        </Card>
        <Card onClick={() => alternarStatus('EM_VIAGEM')} style={cardFiltro('EM_VIAGEM')}>
          <div style={cardValor(STATUS_MAP.EM_VIAGEM.cor)}>{totais.emViagem}</div>
          <div style={cardRotulo}>Em Viagem {filtroStatus === 'EM_VIAGEM' ? '• Ativo' : ''}</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-danger)')}>{totais.vencidas}</div>
          <div style={cardRotulo}>CNH Vencida</div>
        </Card>
      </div>

      <Card>
        <TableToolbar
          title="Motoristas"
          subtitle={`${filtrados.length} motoristas listados`}
          newLabel="Novo Motorista"
          onNew={() => setModalAberto(true)}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={filtroTipo !== 'TODOS' || filtroStatus !== 'TODOS' || filtrosAbertosMobile}
        />

        {/* Barra de Filtros: Tipo + Status */}
        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Tipo:</span>
            {(['TODOS', 'FROTA', 'SVO'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFiltroTipo(f)} style={botaoFiltro(filtroTipo === f)}>
                {f === 'TODOS' ? 'Todos' : f === 'SVO' ? 'Motoristas SVO' : 'Motoristas Frota'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Status:</span>
            <button type="button" onClick={() => setFiltroStatus('TODOS')} style={botaoFiltro(filtroStatus === 'TODOS')}>
              Todos
            </button>
            {(Object.keys(STATUS_MAP) as StatusMotorista[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFiltroStatus(s)}
                style={botaoFiltro(filtroStatus === s, STATUS_MAP[s].cor)}
              >
                {STATUS_MAP[s].label}
              </button>
            ))}
          </div>
        </TableFilterCollapse>

        <Table>
          <thead>
            <tr>
              <th>Motorista</th>
              <th>Número da CNH</th>
              <th>Categoria</th>
              <th>Validade da CNH</th>
              <th>Tipo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                  Nenhum motorista encontrado para este filtro.
                </td>
              </tr>
            ) : (
              filtrados.map((m) => {
                const statusInfo = STATUS_MAP[m.status] ?? { label: m.status, tone: 'neutral' as BadgeTone };
                return (
                  <tr key={m.id}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={m.nome} />
                        <strong style={{ color: 'var(--color-text-strong)', fontWeight: 600 }}>{m.nome}</strong>
                      </span>
                    </td>
                    <td>
                      <IdBadge id={m.numero_cnh} />
                    </td>
                    <td>{m.categoria_cnh}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {formatarData(m.validade_cnh)}
                        {cnhVencida(m.validade_cnh) && <Badge tone="danger">Vencida</Badge>}
                      </span>
                    </td>
                    <td>
                      <Badge tone={m.tipo_motorista === 'SVO' ? 'purple' : 'neutral'}>{m.tipo_motorista}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <Pagination showing={`1–${filtrados.length}`} total={filtrados.length} />
        </Table>
      </Card>

      {modalAberto && (
        <ModalMotorista
          cnhsExistentes={motoristas.map((m) => m.numero_cnh)}
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvar}
        />
      )}
    </div>
  );
}
