import { useCallback, useEffect, useState, useMemo } from 'react';
import { ChevronRight, Wrench } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  FilterSelect,
  MetricCard,
  Pagination,
  PlacaMercosul,
  SearchInput,
  Table,
  TableFilterCollapse,
  TableToolbar,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import type { NovoVeiculoInput, StatusVeiculo, TipoFrota, Veiculo } from '../types/veiculo';
import type { NovoAbastecimentoInput } from '../types/abastecimento';
import type { NovaMultaInput } from '../types/multa';
import { mensagemDeErro } from '../services/api/http';
import { veiculosApi } from '../services/api/veiculosApi';
import { storageService } from '../services/storageService';
import { cn } from '../utils/cn';
import { ModalVeiculo } from './veiculos/ModalVeiculo';
import { ModalManutencoesVeiculo } from './veiculos/ModalManutencoesVeiculo';
import { DrawerDetalhesVeiculo } from './veiculos/DrawerDetalhesVeiculo';
import { ModalAbastecimento } from './abastecimento/ModalAbastecimento';
import { ModalMulta } from './multas/ModalMulta';

const STATUS_MAP: Record<StatusVeiculo, { label: string; tone: BadgeTone }> = {
  DISPONIVEL: { label: 'Disponível', tone: 'success' },
  RESERVADO: { label: 'Reservado', tone: 'warning' },
  EM_USO: { label: 'Em Uso', tone: 'info' },
  MANUTENCAO: { label: 'Manutenção', tone: 'danger' },
};

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [veiculoManutencao, setVeiculoManutencao] = useState<Veiculo | null>(null);
  const [veiculoDetalhes, setVeiculoDetalhes] = useState<Veiculo | null>(null);
  const [veiculoPreSelecionado, setVeiculoPreSelecionado] = useState<Veiculo | null>(null);
  const [modalAbastecimentoAberto, setModalAbastecimentoAberto] = useState(false);
  const [modalMultaAberto, setModalMultaAberto] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const carregarVeiculos = useCallback(async () => {
    try {
      setVeiculos(await veiculosApi.listar());
      setErroCarga(null);
    } catch (error) {
      setErroCarga(mensagemDeErro(error));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarVeiculos();
  }, [carregarVeiculos]);

  const handleManutencaoSalva = (msg: string) => {
    carregarVeiculos();
    exibirFeedback(msg);
  };

  const handleSalvarAbastecimento = (novo: NovoAbastecimentoInput) => {
    storageService.createAbastecimento(novo);
    setModalAbastecimentoAberto(false);
    setVeiculoPreSelecionado(null);
    carregarVeiculos();
    exibirFeedback('Abastecimento registrado com sucesso!');
  };

  const handleSalvarMulta = (nova: NovaMultaInput) => {
    storageService.createMulta(nova);
    setModalMultaAberto(false);
    setVeiculoPreSelecionado(null);
    carregarVeiculos();
    exibirFeedback('Multa registrada com sucesso!');
  };

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

  // Métricas do topo
  const totais = useMemo(() => {
    return {
      total: veiculos.length,
      disponiveis: veiculos.filter((v) => v.status === 'DISPONIVEL').length,
      reservados: veiculos.filter((v) => v.status === 'RESERVADO').length,
      emUso: veiculos.filter((v) => v.status === 'EM_USO').length,
      manutencao: veiculos.filter((v) => v.status === 'MANUTENCAO').length,
    };
  }, [veiculos]);

  // Filtragem combinada por Busca, Tipo de Frota e Status
  const veiculosFiltrados = useMemo(() => {
    return veiculos.filter((v) => {
      const bateTipo = filtroTipo === 'TODOS' || v.tipo_frota === filtroTipo;
      const bateStatus = filtroStatus === 'TODOS' || v.status === filtroStatus;
      if (!bateTipo || !bateStatus) return false;
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const matchPlaca = v.placa.toLowerCase().includes(termo);
        const matchModelo = v.modelo.toLowerCase().includes(termo);
        if (!matchPlaca && !matchModelo) return false;
      }
      return true;
    });
  }, [veiculos, filtroTipo, filtroStatus, busca]);

  const handleSalvarVeiculo = async (novo: NovoVeiculoInput) => {
    await veiculosApi.criar(novo);
    await carregarVeiculos();
    exibirFeedback(`Veículo com placa ${novo.placa} cadastrado com sucesso!`);
  };

  return (
    <div className="grid gap-6">
      {/* Feedback de sucesso e erro */}
      {(mensagemSucesso || mensagemErro) && (
        <Alert tone={mensagemErro ? 'danger' : 'success'}>{mensagemErro || mensagemSucesso}</Alert>
      )}

      {/* ── Cards de Resumo (Clicáveis como Filtros Rápidos, 2x2 no mobile) ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <MetricCard
          label="Total na Frota"
          value={totais.total}
          tone="neutral"
          isActive={filtroStatus === 'TODOS'}
          onClick={() => setFiltroStatus('TODOS')}
          className="px-5 py-4"
        />

        <MetricCard
          label="Disponíveis"
          value={totais.disponiveis}
          tone="success"
          isActive={filtroStatus === 'DISPONIVEL'}
          onClick={() => setFiltroStatus(filtroStatus === 'DISPONIVEL' ? 'TODOS' : 'DISPONIVEL')}
          className="px-5 py-4"
        />

        <MetricCard
          label="Reservados"
          value={totais.reservados}
          tone="warning"
          isActive={filtroStatus === 'RESERVADO'}
          onClick={() => setFiltroStatus(filtroStatus === 'RESERVADO' ? 'TODOS' : 'RESERVADO')}
          className="px-5 py-4"
        />

        <MetricCard
          label="Em Uso"
          value={totais.emUso}
          tone="primary"
          isActive={filtroStatus === 'EM_USO'}
          onClick={() => setFiltroStatus(filtroStatus === 'EM_USO' ? 'TODOS' : 'EM_USO')}
          className="px-5 py-4"
        />

        <MetricCard
          label="Em Manutenção"
          value={totais.manutencao}
          tone="danger"
          isActive={filtroStatus === 'MANUTENCAO'}
          onClick={() => setFiltroStatus(filtroStatus === 'MANUTENCAO' ? 'TODOS' : 'MANUTENCAO')}
          className="col-span-2 px-5 py-4 lg:col-span-1"
        />
      </div>

      {/* ── Tabela de Veículos ── */}
      <Card>
        <TableToolbar
          title="Frota de Veículos"
          subtitle={`${veiculosFiltrados.length} de ${veiculos.length} veículos listados`}
          newLabel="Novo Veículo"
          onNew={() => setModalAberto(true)}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={
            filtroTipo !== 'TODOS' ||
            filtroStatus !== 'TODOS' ||
            Boolean(busca) ||
            filtrosAbertosMobile
          }
        />

        {/* Barra de Filtros: Busca + Tipo de Frota + Status do Veículo */}
        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          {/* Busca textual na esquerda */}
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por placa, modelo ou marca..."
          />

          <FilterSelect
            aria-label="Filtrar por frota"
            value={filtroTipo}
            onChange={(val) => setFiltroTipo(val as TipoFrota | 'TODOS')}
            options={[
              { value: 'TODOS', label: 'Todas as frotas' },
              { value: 'ADMINISTRATIVA', label: 'Frota Administrativa' },
              { value: 'SVO', label: 'Frota SVO' },
            ]}
          />

          <FilterSelect
            aria-label="Filtrar por status do veículo"
            value={filtroStatus}
            onChange={(val) => setFiltroStatus(val)}
            options={[
              { value: 'TODOS', label: 'Todos os status' },
              { value: 'DISPONIVEL', label: 'Disponível' },
              { value: 'RESERVADO', label: 'Reservado' },
              { value: 'EM_USO', label: 'Em Uso' },
              { value: 'MANUTENCAO', label: 'Em Manutenção' },
            ]}
          />

          {(filtroTipo !== 'TODOS' || filtroStatus !== 'TODOS' || busca) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca('');
                setFiltroTipo('TODOS');
                setFiltroStatus('TODOS');
              }}
            >
              Limpar
            </Button>
          )}
        </TableFilterCollapse>

        <Table>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Modelo</th>
              <th>Tipo de Frota</th>
              <th>Capacidade Máxima</th>
              <th>Km Atual</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {veiculosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-9 text-center text-slate-500">
                  <div>
                    {carregando
                      ? 'Carregando veículos...'
                      : (erroCarga ?? 'Nenhum veículo encontrado com os filtros selecionados.')}
                  </div>
                  {(filtroTipo !== 'TODOS' || filtroStatus !== 'TODOS') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFiltroTipo('TODOS');
                        setFiltroStatus('TODOS');
                      }}
                      className="mt-2 cursor-pointer border-none bg-transparent text-xs font-semibold text-primary underline hover:text-primary-hover"
                    >
                      Remover filtros
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              veiculosFiltrados.map((v) => {
                const statusInfo = STATUS_MAP[v.status] || {
                  label: v.status,
                  tone: 'neutral',
                };
                return (
                  <tr
                    key={v.id}
                    onClick={() => setVeiculoDetalhes(v)}
                    className="group cursor-pointer transition-colors duration-150 hover:!bg-surface-hover"
                    title="Clique para ver os detalhes do veículo"
                  >
                    <td>
                      <PlacaMercosul placa={v.placa} size="sm" />
                    </td>
                    <td>
                      <strong className="font-semibold text-slate-900">{v.modelo}</strong>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-[11px] font-bold',
                          v.tipo_frota === 'SVO'
                            ? 'bg-purple-bg text-purple'
                            : 'bg-neutral-bg text-slate-900',
                        )}
                      >
                        {v.tipo_frota}
                      </span>
                    </td>
                    <td>{v.capacidade_maxima}</td>
                    <td>{v.km_atual.toLocaleString('pt-BR')} km</td>
                    <td>
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVeiculoManutencao(v);
                          }}
                          title={`Histórico e registro de manutenções de ${v.modelo}`}
                        >
                          <Wrench size={13} /> Manutenções
                        </Button>
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:bg-primary/10 group-hover:text-primary"
                          title="Ver detalhes do veículo"
                          aria-hidden="true"
                        >
                          <ChevronRight size={15} />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${veiculosFiltrados.length}`} total={veiculosFiltrados.length} />
      </Card>

      {/* ── Modal de Cadastro de Veículo ── */}
      {modalAberto && (
        <ModalVeiculo onClose={() => setModalAberto(false)} onSalvar={handleSalvarVeiculo} />
      )}

      {/* ── Modal de Histórico e Registro de Manutenções ── */}
      {veiculoManutencao && (
        <ModalManutencoesVeiculo
          veiculo={veiculoManutencao}
          onClose={() => setVeiculoManutencao(null)}
          onManutencaoSalva={handleManutencaoSalva}
        />
      )}

      {/* ── Drawer de Detalhes do Veículo ── */}
      <DrawerDetalhesVeiculo
        veiculo={veiculoDetalhes}
        onClose={() => setVeiculoDetalhes(null)}
        onAbrirManutencoes={(v) => setVeiculoManutencao(v)}
        onNovoAbastecimento={(v) => {
          setVeiculoPreSelecionado(v);
          setModalAbastecimentoAberto(true);
        }}
        onNovaMulta={(v) => {
          setVeiculoPreSelecionado(v);
          setModalMultaAberto(true);
        }}
      />

      {/* ── Modal de Abastecimento (Ação Rápida do Drawer) ── */}
      {modalAbastecimentoAberto && (
        <ModalAbastecimento
          onClose={() => {
            setModalAbastecimentoAberto(false);
            setVeiculoPreSelecionado(null);
          }}
          onSalvar={handleSalvarAbastecimento}
          veiculoIdInicial={
            veiculoPreSelecionado ? String(veiculoPreSelecionado.id) : undefined
          }
        />
      )}

      {/* ── Modal de Multa (Ação Rápida do Drawer) ── */}
      {modalMultaAberto && (
        <ModalMulta
          onClose={() => {
            setModalMultaAberto(false);
            setVeiculoPreSelecionado(null);
          }}
          onSalvar={handleSalvarMulta}
          veiculoIdInicial={
            veiculoPreSelecionado ? String(veiculoPreSelecionado.id) : undefined
          }
        />
      )}
    </div>
  );
}
