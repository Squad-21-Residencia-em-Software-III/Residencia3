import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
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
import { storageService } from '../services/storageService';
import { LABELS_STATUS_MULTA } from '../types/multa';
import type { Multa, NovaMultaInput, StatusPagamentoMulta } from '../types/multa';
import { ModalMulta } from './multas/ModalMulta';

const TOM_STATUS: Record<StatusPagamentoMulta, BadgeTone> = {
  PENDENTE: 'warning',
  PAGO: 'success',
  CANCELADO: 'neutral',
};

const brl = (n: number) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarDataHora(iso: string): string {
  const [data, hora] = iso.split('T');
  const d = data.split('-').reverse().join('/');
  return hora ? `${d} ${hora.slice(0, 5)}` : d;
}

export default function MultasPage() {
  const [multas, setMultas] = useState<Multa[]>(() => storageService.getMultas());
  const [modalAberto, setModalAberto] = useState(false);
  const [multaEditando, setMultaEditando] = useState<Multa | undefined>();
  const [multaExcluir, setMultaExcluir] = useState<Multa | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusPagamentoMulta>('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
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
      semMotorista: multas.filter((m) => !m.motorista_id && m.status_pagamento !== 'CANCELADO')
        .length,
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
        exibirFeedback(
          `Multa MLT-${String(multaEditando.id).padStart(4, '0')} atualizada com sucesso.`,
        );
      } else {
        const criada = storageService.createMulta(dados);
        exibirFeedback(`Multa MLT-${String(criada.id).padStart(4, '0')} registrada com sucesso.`);
      }
      setMultas(storageService.getMultas());
    } catch (error) {
      exibirFeedback(error instanceof Error ? error.message : 'Erro ao salvar a multa.', true);
    }
  };

  const handleConfirmarExclusao = () => {
    if (!multaExcluir) return;
    try {
      storageService.deleteMulta(multaExcluir.id);
      setMultas(storageService.getMultas());
      exibirFeedback('Multa removida com sucesso.');
    } catch (error) {
      exibirFeedback(error instanceof Error ? error.message : 'Erro ao excluir a multa.', true);
    } finally {
      setMultaExcluir(null);
    }
  };

  return (
    <div className="grid gap-6">
      {feedback && <Alert tone={feedback.erro ? 'danger' : 'success'}>{feedback.msg}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Multas registradas"
          value={kpis.total}
          subtitle="Total na frota"
          tone="neutral"
        />
        <MetricCard
          label="Pendentes de pagamento"
          value={kpis.qtdPendentes}
          subtitle={`${kpis.valorPendentes} em aberto`}
          tone="warning"
        />
        <MetricCard
          label="Sem motorista vinculado"
          value={kpis.semMotorista}
          subtitle="Aguardando identificação do responsável"
          tone="neutral"
        />
      </div>

      <Card>
        <TableToolbar
          title="Multas e infrações"
          subtitle={`${filtradas.length} registros`}
          newLabel="Nova Multa"
          onNew={abrirNova}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={temFiltro || filtrosAbertosMobile}
        />

        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          {/* Busca textual na esquerda */}
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por placa, motorista ou descrição..."
          />

          {/* Filtros em dropdown e datas na sequência */}
          <FilterSelect
            aria-label="Filtrar por status"
            value={filtroStatus}
            onChange={(val) => setFiltroStatus(val as '' | StatusPagamentoMulta)}
            options={[
              { value: '', label: 'Todos os status' },
              ...(Object.keys(LABELS_STATUS_MULTA) as StatusPagamentoMulta[]).map((s) => ({
                value: s,
                label: LABELS_STATUS_MULTA[s],
              })),
            ]}
          />

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>De:</span>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Até:</span>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none focus:border-primary"
            />
          </div>

          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              Limpar
            </Button>
          )}
        </TableFilterCollapse>

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
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500">
                  {temFiltro
                    ? 'Nenhuma multa encontrada com os filtros aplicados.'
                    : 'Nenhuma multa registrada.'}
                </td>
              </tr>
            ) : (
              filtradas.map((m) => (
                <tr key={m.id}>
                  <td>
                    <IdBadge id={`MLT-${String(m.id).padStart(4, '0')}`} />
                  </td>
                  <td>
                    <span className="text-[13px] whitespace-nowrap text-slate-500">
                      {formatarDataHora(m.data_infracao)}
                    </span>
                    {m.data_vencimento && (
                      <div className="text-xs text-slate-400">
                        Vence em {formatarDataHora(m.data_vencimento)}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[13px] font-semibold text-slate-900">
                        {m.veiculo_placa ?? 'N/D'}
                      </span>
                      <span className="text-xs text-slate-400">{m.veiculo_modelo}</span>
                    </div>
                  </td>
                  <td>
                    {m.motorista_nome ? (
                      <span className="text-[13px] font-medium text-slate-700">
                        {m.motorista_nome}
                      </span>
                    ) : (
                      <span className="text-[13px] text-slate-400 italic">Sem motorista</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13px] text-slate-700">
                        {m.descricao ?? 'Sem descrição'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {[m.id_infracao, m.orgao_autuador, `${m.pontos} pts`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="font-display text-[13px] font-bold whitespace-nowrap text-slate-900">
                      {brl(m.valor)}
                    </span>
                  </td>
                  <td>
                    <Badge tone={TOM_STATUS[m.status_pagamento]}>
                      {LABELS_STATUS_MULTA[m.status_pagamento]}
                    </Badge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        title="Editar multa"
                        onClick={() => abrirEdicao(m)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="danger-outline"
                        size="sm"
                        title="Excluir multa"
                        onClick={() => setMultaExcluir(m)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <Pagination
          showing={`${filtradas.length === 0 ? 0 : 1}–${filtradas.length}`}
          total={filtradas.length}
        />
      </Card>

      {modalAberto && (
        <ModalMulta
          multa={multaEditando}
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvar}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(multaExcluir)}
        title="Excluir Multa"
        description={
          multaExcluir
            ? `Tem certeza que deseja excluir a multa MLT-${String(multaExcluir.id).padStart(4, '0')}?`
            : ''
        }
        confirmLabel="Sim, Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmarExclusao}
        onClose={() => setMultaExcluir(null)}
      />
    </div>
  );
}
