import { useMemo, useState } from 'react';
import { Badge, Button, Card, IdBadge, Input, Pagination, Select, Table, TableToolbar } from '../components/ui';
import type { BadgeTone } from '../components/ui';
import { storageService } from '../services/storageService';
import { LABELS_STATUS_MULTA } from '../types/multa';
import type { Multa, NovaMultaInput, StatusPagamentoMulta } from '../types/multa';
import { ModalMulta } from './multas/ModalMulta';

const TOM_STATUS: Record<StatusPagamentoMulta, BadgeTone> = {
  PENDENTE: 'warning',
  PAGO: 'success',
  CANCELADO: 'neutral',
};

const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarDataHora(iso: string): string {
  const [data, hora] = iso.split('T');
  const d = data.split('-').reverse().join('/');
  return hora ? `${d} ${hora.slice(0, 5)}` : d;
}

export default function MultasPage() {
  const [multas, setMultas] = useState<Multa[]>(() => storageService.getMultas());
  const [modalAberto, setModalAberto] = useState(false);
  const [multaEditando, setMultaEditando] = useState<Multa | undefined>();
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusPagamentoMulta>('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [feedback, setFeedback] = useState<{ msg: string; erro: boolean } | null>(null);

  const exibirFeedback = (msg: string, erro = false) => {
    setFeedback({ msg, erro });
    setTimeout(() => setFeedback(null), 4000);
  };

  const kpis = useMemo(() => {
    const pendentes = multas.filter((m) => m.status_pagamento === 'PENDENTE');
    return {
      total: multas.length,
      qtdPendentes: pendentes.length,
      valorPendentes: brl(pendentes.reduce((acc, m) => acc + Number(m.valor), 0)),
      semMotorista: multas.filter((m) => !m.motorista_id && m.status_pagamento !== 'CANCELADO').length,
    };
  }, [multas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return multas.filter((m) => {
      if (filtroStatus && m.status_pagamento !== filtroStatus) return false;
      const dia = m.data_infracao.slice(0, 10);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (!termo) return true;
      return (
        m.veiculo_placa?.toLowerCase().includes(termo) ||
        m.motorista_nome?.toLowerCase().includes(termo) ||
        m.descricao?.toLowerCase().includes(termo) ||
        m.id_infracao?.toLowerCase().includes(termo) ||
        m.orgao_autuador?.toLowerCase().includes(termo) ||
        String(m.id).includes(termo)
      );
    });
  }, [multas, busca, filtroStatus, de, ate]);

  const temFiltro = Boolean(busca || filtroStatus || de || ate);
  const limparFiltros = () => {
    setBusca('');
    setFiltroStatus('');
    setDe('');
    setAte('');
  };

  const abrirNova = () => {
    setMultaEditando(undefined);
    setModalAberto(true);
  };

  const abrirEdicao = (m: Multa) => {
    setMultaEditando(m);
    setModalAberto(true);
  };

  const handleSalvar = (dados: NovaMultaInput) => {
    try {
      if (multaEditando) {
        storageService.updateMulta(multaEditando.id, dados);
        exibirFeedback(`Multa MLT-${String(multaEditando.id).padStart(4, '0')} atualizada com sucesso.`);
      } else {
        const criada = storageService.createMulta(dados);
        exibirFeedback(`Multa MLT-${String(criada.id).padStart(4, '0')} registrada com sucesso.`);
      }
      setMultas(storageService.getMultas());
    } catch (error) {
      exibirFeedback(error instanceof Error ? error.message : 'Erro ao salvar a multa.', true);
    }
  };

  const handleExcluir = (id: number) => {
    if (!window.confirm(`Tem certeza que deseja excluir a multa MLT-${String(id).padStart(4, '0')}?`)) return;
    try {
      storageService.deleteMulta(id);
      setMultas(storageService.getMultas());
      exibirFeedback('Multa removida com sucesso.');
    } catch (error) {
      exibirFeedback(error instanceof Error ? error.message : 'Erro ao excluir a multa.', true);
    }
  };

  const kpiTitulo = { fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)', marginBottom: '8px' } as const;
  const kpiValor = { fontSize: '26px', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' } as const;
  const kpiRodape = { fontSize: '12px', marginTop: '8px', color: 'var(--color-text-subtle)' } as const;

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {feedback && (
        <div
          role={feedback.erro ? 'alert' : 'status'}
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            border: `1px solid ${feedback.erro ? 'var(--color-danger)' : 'var(--color-success)'}`,
            color: feedback.erro ? 'var(--color-danger)' : 'var(--color-success)',
            fontSize: '14px',
            fontWeight: 600,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {feedback.msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <Card style={{ padding: '20px' }}>
          <div style={kpiTitulo}>Multas registradas</div>
          <div style={kpiValor}>{kpis.total}</div>
          <div style={kpiRodape}>Total na frota</div>
        </Card>
        <Card style={{ padding: '20px' }}>
          <div style={kpiTitulo}>Pendentes de pagamento</div>
          <div style={{ ...kpiValor, color: 'var(--color-warning)' }}>{kpis.qtdPendentes}</div>
          <div style={{ ...kpiRodape, color: 'var(--color-warning)' }}>{kpis.valorPendentes} em aberto</div>
        </Card>
        <Card style={{ padding: '20px' }}>
          <div style={kpiTitulo}>Sem motorista vinculado</div>
          <div style={kpiValor}>{kpis.semMotorista}</div>
          <div style={kpiRodape}>Aguardando identificação do responsável</div>
        </Card>
      </div>

      <Card>
        <TableToolbar
          title="Multas e infrações"
          subtitle={`${filtradas.length} registros`}
          newLabel="Registrar multa"
          onNew={abrirNova}
        />

        <div style={{ padding: '0 24px 16px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', maxWidth: '360px' }}>
            <Input
              label="Buscar"
              type="text"
              placeholder="Placa, motorista, código ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div style={{ width: '180px' }}>
            <Select
              label="Status"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as '' | StatusPagamentoMulta)}
            >
              <option value="">Todos os status</option>
              {(Object.keys(LABELS_STATUS_MULTA) as StatusPagamentoMulta[]).map((s) => (
                <option key={s} value={s}>
                  {LABELS_STATUS_MULTA[s]}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ width: '170px' }}>
            <Input label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div style={{ width: '170px' }}>
            <Input label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          {temFiltro && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Button variant="ghost" size="sm" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            </div>
          )}
        </div>

        <Table>
          <thead>
            <tr>
              <th>Registro</th>
              <th>Data da infração</th>
              <th>Veículo</th>
              <th>Motorista</th>
              <th>Infração</th>
              <th>Valor</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                  {temFiltro ? 'Nenhuma multa encontrada com os filtros aplicados.' : 'Nenhuma multa registrada.'}
                </td>
              </tr>
            ) : (
              filtradas.map((m) => (
                <tr key={m.id}>
                  <td>
                    <IdBadge id={`MLT-${String(m.id).padStart(4, '0')}`} />
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {formatarDataHora(m.data_infracao)}
                    </span>
                    {m.data_vencimento && (
                      <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                        Vence em {formatarDataHora(m.data_vencimento)}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-strong)' }}>
                        {m.veiculo_placa ?? 'N/D'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>{m.veiculo_modelo}</span>
                    </div>
                  </td>
                  <td>
                    {m.motorista_nome ? (
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                        {m.motorista_nome}
                      </span>
                    ) : (
                      <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-subtle)' }}>
                        Sem motorista
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        {m.descricao ?? 'Sem descrição'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                        {[m.id_infracao, m.orgao_autuador, `${m.pontos} pts`].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap' }}>
                      {brl(m.valor)}
                    </span>
                  </td>
                  <td>
                    <Badge tone={TOM_STATUS[m.status_pagamento]}>{LABELS_STATUS_MULTA[m.status_pagamento]}</Badge>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button variant="ghost" size="sm" title="Editar multa" onClick={() => abrirEdicao(m)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Excluir multa"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={() => handleExcluir(m.id)}
                    >
                      Excluir
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <Pagination showing={`${filtradas.length === 0 ? 0 : 1}–${filtradas.length}`} total={filtradas.length} />
      </Card>

      {modalAberto && (
        <ModalMulta
          multa={multaEditando}
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvar}
        />
      )}
    </div>
  );
}
