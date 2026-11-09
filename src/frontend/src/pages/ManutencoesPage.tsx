import { useMemo, useState, useEffect, useCallback } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
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
  PlacaMercosul,
  SearchInput,
  Select,
  Table,
  TableFilterCollapse,
  TableToolbar,
  Textarea,
  type BadgeTone,
} from '../components/ui';
import { manutencoesApi } from '../services/api/manutencoesApi';
import { veiculosApi } from '../services/api/veiculosApi';
import { mensagemDeErro } from '../services/api/http';
import type { Veiculo } from '../types/veiculo';
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
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [carregando, setCarregando] = useState(true);

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
  const [veiculoIdForm, setVeiculoIdForm] = useState<string>('');
  const [tipoForm, setTipoForm] = useState<TipoManutencao>('PREVENTIVA');
  const [dataForm, setDataForm] = useState<string>(new Date().toISOString().split('T')[0]);
  const [custoForm, setCustoForm] = useState<string>('');
  const [statusForm, setStatusForm] = useState<StatusManutencao>('CONCLUIDA');
  const [descricaoForm, setDescricaoForm] = useState<string>('');
  const [erroForm, setErroForm] = useState<string>('');

  // Modal de Edição
  const [manutencaoEditar, setManutencaoEditar] = useState<Manutencao | null>(null);
  const [tipoEditar, setTipoEditar] = useState<TipoManutencao>('PREVENTIVA');
  const [dataEditar, setDataEditar] = useState<string>('');
  const [custoEditar, setCustoEditar] = useState<string>('');
  const [statusEditar, setStatusEditar] = useState<StatusManutencao>('CONCLUIDA');
  const [descricaoEditar, setDescricaoEditar] = useState<string>('');
  const [erroEditar, setErroEditar] = useState<string>('');

  // Diálogo de Exclusão
  const [manutencaoExcluir, setManutencaoExcluir] = useState<Manutencao | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      const listaVeiculos = await veiculosApi.listar().catch(() => []);
      setVeiculos(listaVeiculos);
      if (listaVeiculos.length > 0 && !veiculoIdForm) {
        setVeiculoIdForm(String(listaVeiculos[0].id));
      }
      const listaManutencoes = await manutencoesApi.listarTodas(listaVeiculos.map((v) => v.id));
      setManutencoes(listaManutencoes);
    } catch (err) {
      setFeedback(mensagemDeErro(err));
    } finally {
      setCarregando(false);
    }
  }, [veiculoIdForm]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Métricas
  const metricas = useMemo(() => {
    const totalInvestido = manutencoes.reduce((acc, m) => acc + Number(m.custo || 0), 0);
    const emAndamento = manutencoes.filter((m) => m.status === 'EM_ANDAMENTO').length;
    const preventivas = manutencoes.filter((m) => m.tipo_manutencao === 'PREVENTIVA').length;
    const corretivas = manutencoes.filter((m) => m.tipo_manutencao === 'CORRETIVA').length;

    return {
      totalGasto: totalInvestido.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
      emAndamento,
      preventivas,
      corretivas,
      totalQtd: manutencoes.length,
    };
  }, [manutencoes]);

  // Filtragem
  const filtradas = useMemo(() => {
    return manutencoes.filter((m) => {
      if (filtroVeiculo !== 'TODOS' && String(m.veiculo_id) !== filtroVeiculo) {
        return false;
      }
      if (filtroTipo !== 'TODOS' && m.tipo_manutencao !== filtroTipo) {
        return false;
      }
      if (filtroStatus !== 'TODOS' && m.status !== filtroStatus) {
        return false;
      }
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const placa = m.veiculo_placa?.toLowerCase() || '';
        const modelo = m.veiculo_modelo?.toLowerCase() || '';
        const desc = m.descricao?.toLowerCase() || '';
        const forn = m.fornecedor_nome?.toLowerCase() || '';
        if (
          !placa.includes(termo) &&
          !modelo.includes(termo) &&
          !desc.includes(termo) &&
          !forn.includes(termo)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [manutencoes, filtroVeiculo, filtroTipo, filtroStatus, busca]);

  // Paginação
  const paginadas = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    return filtradas.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [filtradas, paginaAtual]);

  // Opções de Veículos para Filtro
  const opcoesFiltroVeiculo = useMemo(() => {
    return [
      { value: 'TODOS', label: 'Todos os Veículos' },
      ...veiculos.map((v) => ({
        value: String(v.id),
        label: `${v.placa} — ${v.modelo}`,
      })),
    ];
  }, [veiculos]);

  const handleConcluir = async (id: number) => {
    try {
      await manutencoesApi.atualizarStatus(id, 'CONCLUIDA');
      await carregarDados();
      setFeedback('Ordem de serviço concluída e veículo liberado!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback(mensagemDeErro(err));
    }
  };

  const handleIniciar = async (id: number) => {
    try {
      await manutencoesApi.atualizarStatus(id, 'EM_ANDAMENTO');
      await carregarDados();
      setFeedback('Manutenção iniciada e veículo colocado em manutenção!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback(mensagemDeErro(err));
    }
  };

  const handleAbrirEdicao = (m: Manutencao) => {
    setManutencaoEditar(m);
    setTipoEditar(m.tipo_manutencao);
    setDataEditar(m.data_manutencao ? m.data_manutencao.slice(0, 10) : '');
    setCustoEditar(m.custo !== null && m.custo !== undefined ? String(m.custo) : '');
    setStatusEditar(m.status);
    setDescricaoEditar(m.descricao || '');
    setErroEditar('');
  };

  const handleSubmitEditar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!manutencaoEditar) return;
    setErroEditar('');

    const custoNum = parseFloat(custoEditar.replace(',', '.'));
    if (isNaN(custoNum) || custoNum < 0) {
      setErroEditar('Informe um custo numérico válido.');
      return;
    }
    if (!descricaoEditar.trim()) {
      setErroEditar('A descrição detalhada do serviço é obrigatória.');
      return;
    }

    try {
      await manutencoesApi.atualizar(manutencaoEditar.id, {
        tipo_manutencao: tipoEditar,
        data_manutencao: dataEditar,
        custo: custoNum,
        status: statusEditar,
        descricao: descricaoEditar.trim(),
      });
      await carregarDados();
      setManutencaoEditar(null);
      setFeedback(`Manutenção #${manutencaoEditar.id} atualizada com sucesso!`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setErroEditar(mensagemDeErro(err));
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!manutencaoExcluir) return;
    try {
      await manutencoesApi.excluir(manutencaoExcluir.id);
      await carregarDados();
      setFeedback(`Manutenção #${manutencaoExcluir.id} excluída com sucesso!`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback(mensagemDeErro(err));
    } finally {
      setManutencaoExcluir(null);
    }
  };

  const handleSubmitNova = async (e: FormEvent<HTMLFormElement>) => {
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

      await manutencoesApi.criar(payload);
      await carregarDados();
      setModalAberto(false);
      setDescricaoForm('');
      setCustoForm('');
      setFeedback('Manutenção registrada com sucesso!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setErroForm(mensagemDeErro(err));
    }
  };

  return (
    <div className="grid gap-6">
      {feedback && (
        <Alert tone="info" className="mb-2">
          {feedback}
        </Alert>
      )}

      {/* 4 Cards de Métricas Operacionais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          label="Total Investido"
          value={metricas.totalGasto}
          tone="neutral"
          subtitle={`${metricas.totalQtd} ordens registradas`}
          className="px-5 py-4"
        />
        <MetricCard
          label="Em Oficina"
          value={metricas.emAndamento}
          tone={metricas.emAndamento > 0 ? 'warning' : 'success'}
          subtitle="Veículos retidos no momento"
          className="px-5 py-4"
        />
        <MetricCard
          label="Preventivas"
          value={metricas.preventivas}
          tone="info"
          subtitle="Revisões periódicas"
          className="px-5 py-4"
        />
        <MetricCard
          label="Corretivas"
          value={metricas.corretivas}
          tone={metricas.corretivas > 0 ? 'danger' : 'neutral'}
          subtitle="Reparos mecânicos"
          className="px-5 py-4"
        />
      </div>

      {/* Tabela de Manutenções */}
      <Card>
        <TableToolbar
          title="Histórico de manutenções"
          subtitle={
            carregando
              ? 'Carregando registros...'
              : `${filtradas.length} manutenç${filtradas.length === 1 ? 'ão registrada' : 'ões registradas'}`
          }
          newLabel="Nova Manutenção"
          onNew={() => setModalAberto(true)}
          onFilter={() => setFiltrosAbertos((f) => !f)}
          isFilterActive={
            filtroVeiculo !== 'TODOS' ||
            filtroTipo !== 'TODOS' ||
            filtroStatus !== 'TODOS' ||
            Boolean(busca) ||
            filtrosAbertos
          }
        />

        <TableFilterCollapse isOpen={filtrosAbertos}>
          <SearchInput
            value={busca}
            onChange={(val) => {
              setBusca(val);
              setPaginaAtual(1);
            }}
            placeholder="Buscar por placa, modelo ou oficina..."
          />

          <FilterSelect
            aria-label="Filtrar por Veículo"
            value={filtroVeiculo}
            onChange={(val) => {
              setFiltroVeiculo(val);
              setPaginaAtual(1);
            }}
            options={opcoesFiltroVeiculo}
          />

          <FilterSelect
            aria-label="Filtrar por Tipo"
            value={filtroTipo}
            onChange={(val) => {
              setFiltroTipo(val);
              setPaginaAtual(1);
            }}
            options={[
              { value: 'TODOS', label: 'Todos os Tipos' },
              { value: 'PREVENTIVA', label: 'Preventiva' },
              { value: 'CORRETIVA', label: 'Corretiva' },
            ]}
          />

          <FilterSelect
            aria-label="Filtrar por Status"
            value={filtroStatus}
            onChange={(val) => {
              setFiltroStatus(val);
              setPaginaAtual(1);
            }}
            options={[
              { value: 'TODOS', label: 'Todos os Status' },
              { value: 'EM_ANDAMENTO', label: 'Em Oficina' },
              { value: 'AGENDADA', label: 'Agendada' },
              { value: 'CONCLUIDA', label: 'Concluída' },
            ]}
          />

          {(filtroVeiculo !== 'TODOS' ||
            filtroTipo !== 'TODOS' ||
            filtroStatus !== 'TODOS' ||
            busca) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca('');
                setFiltroVeiculo('TODOS');
                setFiltroTipo('TODOS');
                setFiltroStatus('TODOS');
                setPaginaAtual(1);
              }}
            >
              Limpar
            </Button>
          )}
        </TableFilterCollapse>

        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Veículo</th>
              <th>Tipo</th>
              <th>Data</th>
              <th>Descrição & Oficina</th>
              <th>Custo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={8} className="p-9 text-center text-slate-500">
                  Carregando manutenções da API...
                </td>
              </tr>
            ) : paginadas.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8">
                  <EmptyState
                    title="Nenhuma ordem de serviço encontrada"
                    description="Não há registros que correspondam aos filtros selecionados."
                  />
                </td>
              </tr>
            ) : (
              paginadas.map((m) => (
                <tr key={m.id}>
                  <td>
                    <IdBadge id={`#${m.id}`} />
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <PlacaMercosul placa={m.veiculo_placa || 'IAI-0000'} size="sm" />
                      <span className="text-[11px] text-slate-500">{m.veiculo_modelo}</span>
                    </div>
                  </td>
                  <td>
                    <Badge tone={TIPO_MAP[m.tipo_manutencao].tone}>
                      {TIPO_MAP[m.tipo_manutencao].label}
                    </Badge>
                  </td>
                  <td>
                    <span className="text-xs text-slate-600">
                      {new Date(m.data_manutencao).toLocaleDateString('pt-BR')}
                    </span>
                  </td>
                  <td className="max-w-xs">
                    <div className="truncate font-medium text-slate-800" title={m.descricao}>
                      {m.descricao}
                    </div>
                    {m.fornecedor_nome && (
                      <div className="text-[11px] text-slate-500 truncate">
                        Oficina: {m.fornecedor_nome}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="font-semibold text-slate-900">
                      {Number(m.custo || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </span>
                  </td>
                  <td>
                    <Badge tone={STATUS_MAP[m.status].tone}>
                      {STATUS_MAP[m.status].label}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex items-center justify-start gap-1.5">
                      {m.status === 'AGENDADA' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleIniciar(m.id)}
                          title="Iniciar manutenção na oficina"
                        >
                          Iniciar
                        </Button>
                      )}
                      {m.status === 'EM_ANDAMENTO' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleConcluir(m.id)}
                          title="Concluir serviço e liberar veículo"
                        >
                          Concluir
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAbrirEdicao(m)}
                        title="Editar registro de manutenção"
                      >
                        Editar
                      </Button>
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
              ))
            )}
          </tbody>
        </Table>

        <Pagination
          showing={`1–${paginadas.length}`}
          total={filtradas.length}
        />
      </Card>

      {/* Modal de Nova Manutenção */}
      {modalAberto && (
        <Modal title="Nova Manutenção" onClose={() => setModalAberto(false)}>
          <ModalForm onSubmit={handleSubmitNova}>
            {erroForm && <Alert tone="danger">{erroForm}</Alert>}

            <FormRow>
              <Select
                label="Veículo *"
                value={veiculoIdForm}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoIdForm(e.target.value)}
                required
              >
                <option value="">Selecione a viatura</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.modelo}
                  </option>
                ))}
              </Select>

              <Select
                label="Tipo de Manutenção *"
                value={tipoForm}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setTipoForm(e.target.value as TipoManutencao)
                }
                required
              >
                <option value="PREVENTIVA">Preventiva (Revisão periódica)</option>
                <option value="CORRETIVA">Corretiva (Reparo / Avaria)</option>
              </Select>
            </FormRow>

            <FormRow>
              <Input
                label="Data da Manutenção *"
                type="date"
                value={dataForm}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDataForm(e.target.value)}
                required
              />

              <Input
                label="Custo Estimado / Real (R$) *"
                type="text"
                value={custoForm}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCustoForm(e.target.value)}
                placeholder="Ex: 450,00"
                required
              />
            </FormRow>

            <Select
              label="Status Inicial *"
              value={statusForm}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setStatusForm(e.target.value as StatusManutencao)
              }
              required
            >
              <option value="CONCLUIDA">Concluída (Serviço finalizado)</option>
              <option value="EM_ANDAMENTO">Em Oficina (Bloqueia o veículo)</option>
              <option value="AGENDADA">Agendada (Planejada)</option>
            </Select>

            <Textarea
              label="Descrição Detalhada do Serviço *"
              value={descricaoForm}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescricaoForm(e.target.value)}
              placeholder="Ex: Troca de pastilhas de freio dianteiras, óleo do motor e alinhamento/balanceamento."
              rows={3}
              required
            />

            <ModalFooter>
              <Button variant="ghost" type="button" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit">
                Registrar Manutenção
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      )}

      {/* Modal de Editar Manutenção */}
      {manutencaoEditar && (
        <Modal
          title={`Editar Manutenção #${manutencaoEditar.id}`}
          onClose={() => setManutencaoEditar(null)}
        >
          <ModalForm onSubmit={handleSubmitEditar}>
            {erroEditar && <Alert tone="danger">{erroEditar}</Alert>}

            <FormRow>
              <Select
                label="Tipo de Manutenção *"
                value={tipoEditar}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setTipoEditar(e.target.value as TipoManutencao)
                }
                required
              >
                <option value="PREVENTIVA">Preventiva (Revisão periódica)</option>
                <option value="CORRETIVA">Corretiva (Reparo / Avaria)</option>
              </Select>

              <Input
                label="Data da Manutenção *"
                type="date"
                value={dataEditar}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDataEditar(e.target.value)}
                required
              />
            </FormRow>

            <FormRow>
              <Input
                label="Custo (R$) *"
                type="text"
                value={custoEditar}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCustoEditar(e.target.value)}
                placeholder="Ex: 450,00"
                required
              />

              <Select
                label="Status *"
                value={statusEditar}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setStatusEditar(e.target.value as StatusManutencao)
                }
                required
              >
                <option value="AGENDADA">Agendada (Planejada)</option>
                <option value="EM_ANDAMENTO">Em Oficina (Bloqueia o veículo)</option>
                <option value="CONCLUIDA">Concluída (Serviço finalizado)</option>
              </Select>
            </FormRow>

            <Textarea
              label="Descrição Detalhada do Serviço *"
              value={descricaoEditar}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setDescricaoEditar(e.target.value)
              }
              rows={3}
              required
            />

            <ModalFooter>
              <Button variant="ghost" type="button" onClick={() => setManutencaoEditar(null)}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit">
                Salvar Alterações
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      )}

      {/* Confirmação de Exclusão */}
      {manutencaoExcluir && (
        <ConfirmDialog
          isOpen={Boolean(manutencaoExcluir)}
          title="Excluir Registro de Manutenção"
          confirmLabel="Excluir"
          variant="danger"
          onClose={() => setManutencaoExcluir(null)}
          onConfirm={handleConfirmarExclusao}
          description={
            <span>
              Tem certeza que deseja excluir o registro de manutenção{' '}
              <strong>#{manutencaoExcluir.id}</strong> da viatura{' '}
              <strong>{manutencaoExcluir.veiculo_placa}</strong>?
            </span>
          }
        />
      )}
    </div>
  );
}
