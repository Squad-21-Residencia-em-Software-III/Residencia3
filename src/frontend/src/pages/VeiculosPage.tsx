import { useCallback, useEffect, useState, useMemo } from 'react';
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
  SeletorOperacao,
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
import { abastecimentosApi } from '../services/api/abastecimentosApi';
import { multasApi } from '../services/api/multasApi';
import { recursoAtivo } from '../config/recursosBackend';
import { useAbaOperacao } from '../utils/abaOperacao';
import { ModalVeiculo } from './veiculos/ModalVeiculo';
import { DrawerDetalhesVeiculo } from './veiculos/DrawerDetalhesVeiculo';
import { ModalAbastecimento } from './abastecimento/ModalAbastecimento';
import { ModalMulta } from './multas/ModalMulta';
import { VeiculosDisponiveis } from './veiculos/VeiculosDisponiveis';
import { usePermissao } from '../utils/permissoes';

const STATUS_MAP: Record<StatusVeiculo, { label: string; tone: BadgeTone }> = {
  DISPONIVEL: { label: 'Disponível', tone: 'success' },
  RESERVADO: { label: 'Reservado', tone: 'warning' },
  EM_USO: { label: 'Em Uso', tone: 'info' },
  MANUTENCAO: { label: 'Manutenção', tone: 'danger' },
};

/**
 * Quem tem acesso aos detalhes vê a gestão completa da frota; o Solicitante vê só os
 * veículos disponíveis, sem dados sensíveis (a API já devolve a lista reduzida).
 */
export default function VeiculosPage() {
  const { pode } = usePermissao();
  return pode('veiculos.detalhes') ? <GestaoDeVeiculos /> : <VeiculosDisponiveis />;
}

const TEXTOS_FROTA: Record<TipoFrota, { titulo: string; capacidade: string }> = {
  ADMINISTRATIVA: { titulo: 'Frota Administrativa', capacidade: 'Passageiros' },
  SVO: { titulo: 'Frota SVO', capacidade: 'Corpos (máx. 4)' },
};

/** Veículos com a alternância Administrativo/SVO (SCRUM-173); a frota do perfil vem primeiro. */
function GestaoDeVeiculos() {
  const { abasDeVeiculos } = usePermissao();
  const abas = abasDeVeiculos();
  const { ativa, mudar } = useAbaOperacao(abas);
  if (!ativa) return null;

  return (
    <div className="grid gap-6">
      <SeletorOperacao operacoes={abas} ativa={ativa} onChange={mudar} />
      <div key={ativa} className="animate-tab-fade">
        <PainelVeiculos frota={ativa} />
      </div>
    </div>
  );
}

function PainelVeiculos({ frota }: { frota: TipoFrota }) {
  const { podeNaFrota, podeVerDetalhesDaFrota } = usePermissao();
  const textos = TEXTOS_FROTA[frota];
  // Cada gestor só cadastra e edita veículos da própria frota (o Administrador, nas duas)
  const podeCadastrar = podeNaFrota('veiculos.cadastrar', frota);
  const podeEditar = (v: Veiculo) => podeNaFrota('veiculos.cadastrar', v.tipo_frota);
  // Da outra frota o gestor vê só a consulta básica: sem km (nem custos e históricos no drawer)
  const veKm = podeVerDetalhesDaFrota(frota);
  // Lotação da cabine SVO depende da coluna nova (SCRUM-175/181)
  const mostraCabine = frota === 'SVO' && recursoAtivo('lotacaoCabine');
  const totalColunas = 5 + (veKm ? 1 : 0) + (mostraCabine ? 1 : 0);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [veiculoEditando, setVeiculoEditando] = useState<Veiculo | null>(null);
  const [veiculoDetalhes, setVeiculoDetalhes] = useState<Veiculo | null>(null);
  const [veiculoPreSelecionado, setVeiculoPreSelecionado] = useState<Veiculo | null>(null);
  const [modalAbastecimentoAberto, setModalAbastecimentoAberto] = useState(false);
  const [modalMultaAberto, setModalMultaAberto] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const carregarVeiculos = useCallback(async () => {
    try {
      const lista = await veiculosApi.listar();
      setVeiculos(lista.filter((v) => v.tipo_frota === frota));
      setErroCarga(null);
    } catch (error) {
      setErroCarga(mensagemDeErro(error));
    } finally {
      setCarregando(false);
    }
  }, [frota]);

  useEffect(() => {
    carregarVeiculos();
  }, [carregarVeiculos]);

  const handleSalvarAbastecimento = async (novo: NovoAbastecimentoInput) => {
    try {
      await abastecimentosApi.criar({
        veiculo_id: novo.veiculo_id,
        motorista_id: novo.motorista_id,
        data_abastecimento: novo.data_abastecimento,
        quilometragem: novo.quilometragem,
        litros: novo.litros,
        valor_total: novo.valor_total,
        posto_combustivel: novo.posto_combustivel || 'Posto Credenciado',
      });
      setModalAbastecimentoAberto(false);
      setVeiculoPreSelecionado(null);
      await carregarVeiculos();
      exibirFeedback('Abastecimento registrado com sucesso!');
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
      throw error;
    }
  };

  const handleSalvarMulta = async (nova: NovaMultaInput) => {
    try {
      await multasApi.criar(nova);
      setModalMultaAberto(false);
      setVeiculoPreSelecionado(null);
      await carregarVeiculos();
      exibirFeedback('Multa registrada com sucesso!');
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
      throw error;
    }
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

  // Filtragem combinada por Busca e Status (a aba já define a frota)
  const veiculosFiltrados = useMemo(() => {
    return veiculos.filter((v) => {
      if (filtroStatus !== 'TODOS' && v.status !== filtroStatus) return false;
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const matchPlaca = v.placa.toLowerCase().includes(termo);
        const matchModelo = v.modelo.toLowerCase().includes(termo);
        if (!matchPlaca && !matchModelo) return false;
      }
      return true;
    });
  }, [veiculos, filtroStatus, busca]);

  const handleSalvarVeiculo = async (novo: NovoVeiculoInput) => {
    try {
      if (veiculoEditando) {
        await veiculosApi.atualizar(veiculoEditando.id, novo);
        exibirFeedback(`Veículo com placa ${novo.placa} atualizado com sucesso!`);
      } else {
        await veiculosApi.criar(novo);
        exibirFeedback(`Veículo com placa ${novo.placa} cadastrado com sucesso!`);
      }
      await carregarVeiculos();
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
      throw error;
    }
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
          title={textos.titulo}
          subtitle={`${veiculosFiltrados.length} de ${veiculos.length} veículos listados`}
          newLabel={podeCadastrar ? 'Novo Veículo' : undefined}
          onNew={podeCadastrar ? () => setModalAberto(true) : undefined}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={
            filtroStatus !== 'TODOS' ||
            Boolean(busca) ||
            filtrosAbertosMobile
          }
        />

        {/* Barra de Filtros: Busca + Status do Veículo */}
        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          {/* Busca textual na esquerda */}
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por placa, modelo ou marca..."
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

          {(filtroStatus !== 'TODOS' || busca) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca('');
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
              <th>{textos.capacidade}</th>
              {mostraCabine && <th>Cabine (pessoas)</th>}
              {veKm && <th>Km Atual</th>}
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {veiculosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={totalColunas} className="p-9 text-center text-slate-500">
                  {carregando ? (
                    <div>Carregando veículos...</div>
                  ) : erroCarga ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-rose-600">
                      <p className="font-medium">Falha na comunicação com o servidor: {erroCarga}</p>
                      <Button variant="outline" size="sm" onClick={carregarVeiculos}>
                        Tentar novamente
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <div>Nenhum veículo encontrado com os filtros selecionados.</div>
                      {filtroStatus !== 'TODOS' && (
                        <button
                          type="button"
                          onClick={() => {
                            setFiltroStatus('TODOS');
                          }}
                          className="mt-2 cursor-pointer border-none bg-transparent text-xs font-semibold text-primary underline hover:text-primary-hover"
                        >
                          Remover filtros
                        </button>
                      )}
                    </div>
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
                    <td>{v.capacidade_maxima}</td>
                    {mostraCabine && (
                      <td>
                        {v.lotacao_cabine ?? (
                          <span className="text-xs text-slate-400" title="Lotação não cadastrada">
                            Não informada
                          </span>
                        )}
                      </td>
                    )}
                    {veKm && <td>{v.km_atual.toLocaleString('pt-BR')} km</td>}
                    <td>
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-start gap-1.5">
                        {podeEditar(v) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVeiculoEditando(v);
                            }}
                            title={`Editar dados de ${v.modelo}`}
                          >
                            Editar
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
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

      {/* ── Modal de Cadastro e Edição de Veículo ── */}
      {(modalAberto || veiculoEditando) && (
        <ModalVeiculo
          veiculoParaEditar={veiculoEditando}
          apenasFrota={frota}
          onClose={() => {
            setModalAberto(false);
            setVeiculoEditando(null);
          }}
          onSalvar={handleSalvarVeiculo}
        />
      )}

      {/* ── Drawer de Detalhes do Veículo ── */}
      <DrawerDetalhesVeiculo
        veiculo={veiculoDetalhes}
        onClose={() => setVeiculoDetalhes(null)}
        onEditar={veiculoDetalhes && podeEditar(veiculoDetalhes) ? (v) => setVeiculoEditando(v) : undefined}
        onNovoAbastecimento={
          veiculoDetalhes && podeNaFrota('abastecimentos.registrar', veiculoDetalhes.tipo_frota)
            ? (v) => {
                setVeiculoPreSelecionado(v);
                setModalAbastecimentoAberto(true);
              }
            : undefined
        }
        onNovaMulta={
          veiculoDetalhes && podeNaFrota('multas.gerenciar', veiculoDetalhes.tipo_frota)
            ? (v) => {
                setVeiculoPreSelecionado(v);
                setModalMultaAberto(true);
              }
            : undefined
        }
      />

      {/* ── Modal de Abastecimento (Ação Rápida do Drawer) ── */}
      {modalAbastecimentoAberto && (
        <ModalAbastecimento
          onClose={() => {
            setModalAbastecimentoAberto(false);
            setVeiculoPreSelecionado(null);
          }}
          onSalvar={handleSalvarAbastecimento}
          filtrarVeiculo={(v) => podeNaFrota('abastecimentos.registrar', v.tipo_frota)}
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
          filtrarVeiculo={(v) => podeNaFrota('multas.gerenciar', v.tipo_frota)}
          veiculoIdInicial={
            veiculoPreSelecionado ? String(veiculoPreSelecionado.id) : undefined
          }
        />
      )}
    </div>
  );
}
