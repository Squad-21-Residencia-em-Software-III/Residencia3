import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Play,
  Plus,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FilterSelect,
  FormRow,
  IdBadge,
  Input,
  MetricCard,
  Modal,
  ModalFooter,
  ModalForm,
  Pagination,
  SearchInput,
  Select,
  Table,
  TableFilterCollapse,
  TableToolbar,
  Textarea,
  type BadgeTone,
} from '../components/ui';
import { storageService } from '../services/storageService';
import type {
  Manutencao,
  NovaManutencaoInput,
  StatusManutencao,
  TipoManutencao,
} from '../types/manutencao';

const STATUS_MAP: Record<StatusManutencao, { label: string; tone: BadgeTone }> = {
  AGENDADA: { label: 'Agendada', tone: 'neutral' },
  EM_ANDAMENTO: { label: 'Em Oficina', tone: 'info' },
  CONCLUIDA: { label: 'Concluída', tone: 'success' },
};

const TIPO_MAP: Record<TipoManutencao, { label: string; tone: BadgeTone }> = {
  PREVENTIVA: { label: 'Preventiva', tone: 'info' },
  CORRETIVA: { label: 'Corretiva', tone: 'danger' },
};

export default function ManutencoesPage() {
  const [manutencoes, setManutencoes] = useState<Manutencao[]>(() =>
    storageService.getManutencoes(),
  );
  const veiculos = useMemo(() => storageService.getVeiculos(), []);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroVeiculo, setFiltroVeiculo] = useState<string>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 10;

  // Modal de Cadastro
  const [modalAberto, setModalAberto] = useState(false);
  const [manutencaoExcluir, setManutencaoExcluir] = useState<Manutencao | null>(null);
  const [veiculoIdForm, setVeiculoIdForm] = useState<string>(
    veiculos[0]?.id ? String(veiculos[0].id) : '',
  );
  const [tipoForm, setTipoForm] = useState<TipoManutencao>('PREVENTIVA');
  const [dataForm, setDataForm] = useState<string>(new Date().toISOString().split('T')[0]);
  const [custoForm, setCustoForm] = useState<string>('');
  const [statusForm, setStatusForm] = useState<StatusManutencao>('CONCLUIDA');
  const [descricaoForm, setDescricaoForm] = useState<string>('');
  const [erroForm, setErroForm] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Métricas
  const metricas = useMemo(() => {
    const totalInvestido = manutencoes.reduce((acc, m) => acc + Number(m.custo || 0), 0);
    const emAndamento = manutencoes.filter((m) => m.status === 'EM_ANDAMENTO').length;
    const preventivas = manutencoes.filter((m) => m.tipo_manutencao === 'PREVENTIVA').length;
    const corretivas = manutencoes.filter((m) => m.tipo_manutencao === 'CORRETIVA').length;

    return {
      totalInvestido: totalInvestido.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
      emAndamento,
      preventivas,
      corretivas,
    };
  }, [manutencoes]);

  // Lista filtrada
  const filtradas = useMemo(() => {
    return manutencoes.filter((m) => {
      if (filtroVeiculo !== 'TODOS' && String(m.veiculo_id) !== filtroVeiculo) return false;
      if (filtroTipo !== 'TODOS' && m.tipo_manutencao !== filtroTipo) return false;
      if (filtroStatus !== 'TODOS' && m.status !== filtroStatus) return false;

      if (busca.trim()) {
        const t = busca.trim().toLowerCase();
        const vPlaca = (m.veiculo_placa ?? '').toLowerCase();
        const vModelo = (m.veiculo_modelo ?? '').toLowerCase();
        const desc = (m.descricao ?? '').toLowerCase();
        if (!vPlaca.includes(t) && !vModelo.includes(t) && !desc.includes(t)) {
          return false;
        }
      }

      return true;
    });
  }, [manutencoes, filtroVeiculo, filtroTipo, filtroStatus, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / ITENS_POR_PAGINA));
  const paginaSegura = Math.min(paginaAtual, totalPaginas);

  const paginadas = useMemo(() => {
    const inicio = (paginaSegura - 1) * ITENS_POR_PAGINA;
    return filtradas.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [filtradas, paginaSegura]);

  const opcoesVeiculos = useMemo(() => {
    return [
      { value: 'TODOS', label: 'Todos os veículos' },
      ...veiculos.map((v) => ({
        value: String(v.id),
        label: `${v.placa} — ${v.modelo}`,
      })),
    ];
  }, [veiculos]);

  const recarregar = () => {
    setManutencoes(storageService.getManutencoes());
  };

  const handleConcluir = (id: number) => {
    try {
      storageService.atualizarStatusManutencao(id, 'CONCLUIDA');
      recarregar();
      setFeedback('Ordem de serviço concluída e veículo liberado!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao concluir manutenção.');
    }
  };

  const handleIniciar = (id: number) => {
    try {
      storageService.atualizarStatusManutencao(id, 'EM_ANDAMENTO');
      recarregar();
      setFeedback('Manutenção iniciada e veículo colocado em manutenção!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao iniciar manutenção.');
    }
  };

  const handleConfirmarExclusao = () => {
    if (!manutencaoExcluir) return;
    try {
      storageService.deleteManutencao(manutencaoExcluir.id);
      recarregar();
      setFeedback('Registro de manutenção excluído com sucesso.');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir manutenção.');
    } finally {
      setManutencaoExcluir(null);
    }
  };

  const handleSubmitNova = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErroForm('');

    const vId = Number(veiculoIdForm);
    if (!vId) {
      setErroForm('Selecione um veículo.');
      return;
    }
    const custoNum = parseFloat(custoForm.replace(',', '.'));
    if (isNaN(custoNum) || custoNum < 0) {
      setErroForm('Informe um custo numérico válido.');
      return;
    }
    if (!descricaoForm.trim()) {
      setErroForm('A descrição detalhada do serviço é obrigatória.');
      return;
    }

    try {
      const payload: NovaManutencaoInput = {
        veiculo_id: vId,
        tipo_manutencao: tipoForm,
        data_manutencao: dataForm,
        descricao: descricaoForm.trim(),
        custo: custoNum,
        status: statusForm,
        atualizar_status_veiculo: statusForm === 'EM_ANDAMENTO',
      };

      storageService.createManutencao(payload);
      recarregar();
      setModalAberto(false);
      setDescricaoForm('');
      setCustoForm('');
      setFeedback('Manutenção registrada com sucesso!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setErroForm(err.message || 'Erro ao registrar manutenção.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <Alert tone="success" onClose={() => setFeedback(null)}>
          {feedback}
        </Alert>
      )}

      {/* 2. Cards de Métricas Consolidadas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Em oficina agora"
          value={metricas.emAndamento}
          tone={metricas.emAndamento > 0 ? 'danger' : 'success'}
          icon={<Wrench size={20} className={metricas.emAndamento > 0 ? 'text-rose-600' : 'text-emerald-600'} />}
          subtitle={metricas.emAndamento > 0 ? 'Veículos indisponíveis' : 'Nenhum veículo retido'}
          isActive={filtroStatus === 'EM_ANDAMENTO'}
          onClick={() => setFiltroStatus(filtroStatus === 'EM_ANDAMENTO' ? 'TODOS' : 'EM_ANDAMENTO')}
        />

        <MetricCard
          label="Total investido"
          value={metricas.totalInvestido}
          tone="primary"
          icon={<DollarSign size={20} className="text-primary" />}
          subtitle={`${manutencoes.length} ordens registradas`}
        />

        <MetricCard
          label="Preventivas"
          value={metricas.preventivas}
          tone="info"
          icon={<ShieldCheck size={20} className="text-blue-600" />}
          subtitle="Revisões periódicas"
          isActive={filtroTipo === 'PREVENTIVA'}
          onClick={() => setFiltroTipo(filtroTipo === 'PREVENTIVA' ? 'TODOS' : 'PREVENTIVA')}
        />

        <MetricCard
          label="Corretivas"
          value={metricas.corretivas}
          tone="warning"
          icon={<Clock size={20} className="text-amber-600" />}
          subtitle="Reparos emergenciais"
          isActive={filtroTipo === 'CORRETIVA'}
          onClick={() => setFiltroTipo(filtroTipo === 'CORRETIVA' ? 'TODOS' : 'CORRETIVA')}
        />
      </div>

      {/* 3. Tabela de Histórico de Manutenções */}
      <Card className="flex flex-col overflow-hidden">
        <TableToolbar
          title="Histórico de manutenções"
          subtitle={`${filtradas.length} registros recentes`}
          newLabel="Nova Manutenção"
          onNew={() => setModalAberto(true)}
          onFilter={() => setFiltrosAbertos((v) => !v)}
          isFilterActive={filtrosAbertos || filtroVeiculo !== 'TODOS' || filtroTipo !== 'TODOS' || filtroStatus !== 'TODOS' || Boolean(busca)}
        />

        <TableFilterCollapse isOpen={filtrosAbertos}>
          <div className="flex flex-col gap-2.5 bg-surface-alt px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center md:px-6">
            <SearchInput
              value={busca}
              onChange={setBusca}
              placeholder="Buscar por descrição ou veículo..."
            />

            <FilterSelect
              value={filtroVeiculo}
              onChange={setFiltroVeiculo}
              options={opcoesVeiculos}
              aria-label="Filtrar por veículo"
            />

            <FilterSelect
              value={filtroTipo}
              onChange={setFiltroTipo}
              options={[
                { value: 'TODOS', label: 'Todos os tipos' },
                { value: 'PREVENTIVA', label: 'Preventiva' },
                { value: 'CORRETIVA', label: 'Corretiva' },
              ]}
              aria-label="Filtrar por tipo"
            />

            <FilterSelect
              value={filtroStatus}
              onChange={setFiltroStatus}
              options={[
                { value: 'TODOS', label: 'Todos os status' },
                { value: 'EM_ANDAMENTO', label: 'Em Oficina' },
                { value: 'AGENDADA', label: 'Agendada' },
                { value: 'CONCLUIDA', label: 'Concluída' },
              ]}
              aria-label="Filtrar por status"
            />
          </div>
        </TableFilterCollapse>

        <Table>
          <thead>
            <tr>
              <th>Registro</th>
              <th>Data</th>
              <th>Veículo</th>
              <th>Tipo</th>
              <th>Descrição do Serviço</th>
              <th>Custo</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginadas.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-9 text-center text-slate-500">
                  <EmptyState
                    icon={<Wrench size={32} />}
                    title="Nenhuma manutenção encontrada"
                    description="Ajuste os filtros ou registre uma nova ordem de serviço."
                    action={
                      <Button variant="primary" size="sm" onClick={() => setModalAberto(true)}>
                        <Plus size={14} className="mr-1" /> Registrar Manutenção
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : (
              paginadas.map((m) => {
                const tipoInfo = TIPO_MAP[m.tipo_manutencao] || {
                  label: m.tipo_manutencao,
                  tone: 'neutral',
                };
                const statusInfo = STATUS_MAP[m.status] || {
                  label: m.status,
                  tone: 'neutral',
                };

                return (
                  <tr key={m.id} className="transition-colors hover:!bg-surface-hover">
                    <td>
                      <IdBadge id={`MAN-${String(m.id).padStart(4, '0')}`} />
                    </td>
                    <td className="font-medium whitespace-nowrap text-xs text-slate-600">
                      {new Date(m.data_manutencao).toLocaleDateString('pt-BR', {
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[13px] font-semibold text-slate-900">
                          {m.veiculo_placa ?? 'N/D'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {m.veiculo_modelo ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={tipoInfo.tone}>{tipoInfo.label}</Badge>
                    </td>
                    <td className="max-w-[280px]" title={m.descricao}>
                      <div className="truncate text-xs text-slate-700">{m.descricao}</div>
                    </td>
                    <td className="font-semibold whitespace-nowrap text-xs text-slate-900">
                      {Number(m.custo).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                    <td>
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {m.status === 'EM_ANDAMENTO' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleConcluir(m.id)}
                            title="Finalizar serviço e liberar o veículo"
                            className="border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                          >
                            <CheckCircle2 size={13} className="mr-1" /> Concluir
                          </Button>
                        )}
                        {m.status === 'AGENDADA' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            onClick={() => handleIniciar(m.id)}
                            title="Iniciar serviço e colocar veículo em oficina"
                          >
                            <Play size={13} className="mr-1" /> Iniciar
                          </Button>
                        )}
                        <Button
                          variant="danger-outline"
                          size="sm"
                          onClick={() => setManutencaoExcluir(m)}
                          title="Excluir manutenção"
                        >
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <Pagination
          currentPage={paginaSegura}
          totalItems={filtradas.length}
          pageSize={ITENS_POR_PAGINA}
          onPageChange={setPaginaAtual}
        />
      </Card>

      {/* 4. Modal de Nova Manutenção */}
      {modalAberto && (
        <Modal
          title="Registrar Nova Manutenção"
          onClose={() => setModalAberto(false)}
          maxWidth="640px"
        >
          <ModalForm onSubmit={handleSubmitNova}>
            {erroForm && <Alert tone="danger">{erroForm}</Alert>}

            <Select
              label="Veículo da Frota *"
              value={veiculoIdForm}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoIdForm(e.target.value)}
              required
            >
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} — {v.modelo} (Frota {v.tipo_frota})
                </option>
              ))}
            </Select>

            <FormRow>
              <Select
                label="Tipo de Manutenção *"
                value={tipoForm}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setTipoForm(e.target.value as TipoManutencao)
                }
              >
                <option value="PREVENTIVA">Preventiva (Revisão periódica)</option>
                <option value="CORRETIVA">Corretiva (Conserto de avarias)</option>
              </Select>

              <Input
                label="Data da Manutenção *"
                type="date"
                value={dataForm}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDataForm(e.target.value)}
                required
              />
            </FormRow>

            <FormRow>
              <Input
                label="Custo Total (R$) *"
                placeholder="Ex: 450,00"
                type="number"
                min="0"
                step="0.01"
                value={custoForm}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCustoForm(e.target.value)}
                required
              />

              <Select
                label="Status da Manutenção *"
                value={statusForm}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setStatusForm(e.target.value as StatusManutencao)
                }
              >
                <option value="CONCLUIDA">Concluída (Finalizada)</option>
                <option value="EM_ANDAMENTO">Em Andamento (Oficina / Parado)</option>
                <option value="AGENDADA">Agendada (Planejada)</option>
              </Select>
            </FormRow>

            <Textarea
              label="Descrição Detalhada do Serviço *"
              value={descricaoForm}
              onChange={(e) => setDescricaoForm(e.target.value)}
              placeholder="Ex: Substituição das pastilhas de freio dianteiras e alinhamento..."
              rows={3}
              required
            />

            {statusForm === 'EM_ANDAMENTO' && (
              <Alert tone="info">
                Como o status é <strong>Em Andamento</strong>, o veículo selecionado será colocado
                automaticamente em <strong>MANUTENÇÃO</strong>.
              </Alert>
            )}

            <ModalFooter onCancel={() => setModalAberto(false)} confirmLabel="Registrar Manutenção" />
          </ModalForm>
        </Modal>
      )}

      {/* 5. Diálogo de Confirmação de Exclusão */}
      <ConfirmDialog
        isOpen={Boolean(manutencaoExcluir)}
        title="Excluir Manutenção"
        description={
          manutencaoExcluir
            ? `Tem certeza que deseja excluir o registro MAN-${String(manutencaoExcluir.id).padStart(4, '0')} (${manutencaoExcluir.descricao})? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Sim, Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmarExclusao}
        onClose={() => setManutencaoExcluir(null)}
      />
    </div>
  );
}
