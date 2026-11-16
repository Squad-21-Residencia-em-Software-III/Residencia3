import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronRight, Flag, MapPin, Play } from 'lucide-react';
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
  SeletorOperacao,
  Table,
  TableFilterCollapse,
  TableToolbar,
  type BadgeTone,
} from '../components/ui';
import { BotaoExportarRelatorio } from '../components/relatorios/BotaoExportarRelatorio';
import { mensagemDeErro } from '../services/api/http';
import { motoristasApi } from '../services/api/motoristasApi';
import { solicitacoesApi } from '../services/api/solicitacoesApi';
import { veiculosApi } from '../services/api/veiculosApi';
import { viagensApi } from '../services/api/viagensApi';
import type { Motorista } from '../types/motorista';
import type { SolicitacaoViagem } from '../types/solicitacao';
import type { Veiculo } from '../types/veiculo';
import {
  LABELS_STATUS_VIAGEM,
  type NovaViagemInput,
  type OrdemPendenteSvo,
  type StatusViagem,
  type TipoOperacaoViagem,
  type Viagem,
} from '../types/viagem';
import { useAbaOperacao } from '../utils/abaOperacao';
import { cn } from '../utils/cn';
import { DrawerDetalhesViagem } from './viagens/DrawerDetalhesViagem';
import { ModalFinalizarViagem } from './viagens/ModalFinalizarViagem';
import { ModalAgendarColetaSvo } from './viagens/ModalAgendarColetaSvo';
import { ModalIniciarViagem } from './viagens/ModalIniciarViagem';
import { ModalNovaViagem } from './viagens/ModalNovaViagem';
import { usePermissao } from '../utils/permissoes';

type FiltroStatusViagem = 'TODOS' | 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

interface DadosNovaViagem {
  veiculos: Veiculo[];
  motoristas: Motorista[];
  solicitacoes: SolicitacaoViagem[];
  erroSolicitacoes: string | null;
}

interface DadosAgendarColeta {
  ordem: OrdemPendenteSvo;
  veiculos: Veiculo[];
  motoristas: Motorista[];
}

const TEXTOS_OPERACAO: Record<
  TipoOperacaoViagem,
  { total: string; titulo: string; registro: string; vazio: string; carregando: string }
> = {
  ADMINISTRATIVA: {
    total: 'Total de Viagens',
    titulo: 'Viagens administrativas',
    registro: 'viagens registradas',
    vazio: 'Nenhuma viagem encontrada com os filtros selecionados.',
    carregando: 'Carregando viagens...',
  },
  SVO: {
    total: 'Total de Coletas',
    titulo: 'Coletas SVO',
    registro: 'coletas registradas',
    vazio: 'Nenhuma coleta encontrada com os filtros selecionados.',
    carregando: 'Carregando coletas...',
  },
};

// Viagens administrativas e ordens SVO têm ids independentes e podem repetir o mesmo número
const chaveViagem = (v: Viagem) => `${v.tipo_operacao}-${v.id}`;

function obterBadgeToneStatus(status: StatusViagem): BadgeTone {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'info';
    case 'AGENDADA':
      return 'purple';
    case 'CONCLUIDA':
      return 'success';
    case 'CANCELADA':
    default:
      return 'neutral';
  }
}

function formatarDataHora(isoString?: string | null): string {
  if (!isoString) return '—';
  const data = new Date(isoString);
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const horas = String(data.getHours()).padStart(2, '0');
  const minutos = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} ${horas}:${minutos}`;
}

function limitarTexto(texto: string | null, maximo = 28): string {
  if (!texto) return '—';
  return texto.length > maximo ? `${texto.slice(0, maximo)}...` : texto;
}

/**
 * Viagens com a alternância Administrativo/SVO (SCRUM-171). Cada aba tem lista, indicadores e
 * filtros próprios: Administrativo mostra viagens da frota institucional; SVO mostra as coletas e
 * as ordens aguardando agendamento.
 */
export default function ViagensPage() {
  const { pode, abasDeViagens } = usePermissao();
  const abas = abasDeViagens();
  const { ativa, mudar } = useAbaOperacao(abas);

  if (!ativa) return null;

  // O Gestor SVO só acompanha, no Administrativo, as viagens que ele mesmo pediu (SCRUM-179)
  const somenteProprias =
    ativa === 'ADMINISTRATIVA' &&
    !pode('viagens.operacaoAdministrativa') &&
    pode('viagens.acompanharProprias');

  return (
    <div className="grid w-full min-w-0 gap-5">
      <SeletorOperacao operacoes={abas} ativa={ativa} onChange={mudar} />
      <div key={ativa} className="animate-tab-fade">
        <PainelViagens operacao={ativa} somenteProprias={somenteProprias} />
      </div>
    </div>
  );
}

interface PainelViagensProps {
  operacao: TipoOperacaoViagem;
  /** Só as viagens pedidas pelo próprio usuário, sem ações de gestão. */
  somenteProprias: boolean;
}

function PainelViagens({ operacao, somenteProprias }: PainelViagensProps) {
  const location = useLocation();
  const { pode } = usePermissao();
  const isSvo = operacao === 'SVO';
  const textos = TEXTOS_OPERACAO[operacao];
  // Agendar viagem administrativa (Admin e Gestor de Frota); alocar coleta SVO (Admin e Gestor SVO)
  const podeAgendar = !isSvo && !somenteProprias && pode('viagens.agendar');
  const podeAlocarSvo = isSvo && pode('viagens.alocarSvo');
  const podeCancelar = !somenteProprias && pode('viagens.cancelar');
  // Motoristas registram saída e retorno das próprias viagens (a API só lista as deles)
  const podeExecutar = !somenteProprias && pode('viagens.executar');
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusViagem>('TODOS');
  const [filtroMotorista, setFiltroMotorista] = useState<string>('TODOS');
  const [filtroVeiculo, setFiltroVeiculo] = useState<string>('TODOS');
  const [busca, setBusca] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [modalNovaAberto, setModalNovaAberto] = useState(false);
  const [dadosNovaViagem, setDadosNovaViagem] = useState<DadosNovaViagem | null>(null);

  // Ordens SVO aguardando agendamento (só para quem aloca coletas)
  const [pendentes, setPendentes] = useState<OrdemPendenteSvo[]>([]);
  const [carregandoPendentes, setCarregandoPendentes] = useState(podeAlocarSvo);
  const [erroPendentes, setErroPendentes] = useState<string | null>(null);
  const [ordemAgendar, setOrdemAgendar] = useState<OrdemPendenteSvo | null>(null);
  const [dadosAgendarColeta, setDadosAgendarColeta] = useState<DadosAgendarColeta | null>(null);

  useEffect(() => {
    if (location.state?.solicitacaoId && podeAgendar) {
      setModalNovaAberto(true);
    }
  }, [location.state, podeAgendar]);
  const [viagemDetalhes, setViagemDetalhes] = useState<Viagem | null>(null);
  const [viagemIniciar, setViagemIniciar] = useState<Viagem | null>(null);
  const [viagemFinalizar, setViagemFinalizar] = useState<Viagem | null>(null);
  const [viagemCancelar, setViagemCancelar] = useState<Viagem | null>(null);
  const [cancelandoViagem, setCancelandoViagem] = useState(false);
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

  const carregarViagens = useCallback(async () => {
    try {
      const lista = somenteProprias
        ? await viagensApi.listarMinhasAdministrativas()
        : await viagensApi.listar();
      // A API lista as duas operações a quem gerencia as duas; cada aba mostra só a sua
      setViagens(lista.filter((v) => v.tipo_operacao === operacao));
      setErroCarga(null);
    } catch (error) {
      setErroCarga(mensagemDeErro(error));
    } finally {
      setCarregando(false);
    }
  }, [operacao, somenteProprias]);

  useEffect(() => {
    carregarViagens();
  }, [carregarViagens]);

  const carregarPendentes = useCallback(async () => {
    if (!podeAlocarSvo) return;
    setCarregandoPendentes(true);
    try {
      setPendentes(await viagensApi.listarOrdensPendentesSvo());
      setErroPendentes(null);
    } catch (error) {
      setPendentes([]);
      setErroPendentes(mensagemDeErro(error));
    } finally {
      setCarregandoPendentes(false);
    }
  }, [podeAlocarSvo]);

  useEffect(() => {
    void carregarPendentes();
  }, [carregarPendentes]);

  // Atalho de Solicitações SVO: abre o agendamento da ordem confirmada
  const solicitacaoSvoDoAtalho: number | undefined = location.state?.agendarSolicitacaoSvoId;
  const [atalhoUsado, setAtalhoUsado] = useState(false);
  useEffect(() => {
    if (atalhoUsado || !solicitacaoSvoDoAtalho || carregandoPendentes) return;
    const ordem = pendentes.find((p) => p.solicitacao_id === solicitacaoSvoDoAtalho);
    if (ordem) setOrdemAgendar(ordem);
    setAtalhoUsado(true);
  }, [atalhoUsado, solicitacaoSvoDoAtalho, carregandoPendentes, pendentes]);

  // Veículos e motoristas buscados a cada abertura, para refletir os status atuais
  useEffect(() => {
    if (!ordemAgendar) {
      setDadosAgendarColeta(null);
      return;
    }
    let ativo = true;
    Promise.all([veiculosApi.listar(), motoristasApi.listar()])
      .then(([veiculos, motoristas]) => {
        if (ativo) setDadosAgendarColeta({ ordem: ordemAgendar, veiculos, motoristas });
      })
      .catch((error) => {
        if (!ativo) return;
        setOrdemAgendar(null);
        exibirFeedback(mensagemDeErro(error), true);
      });
    return () => {
      ativo = false;
    };
  }, [ordemAgendar]);

  // Veículos e motoristas são buscados a cada abertura para refletir os status atuais do backend
  useEffect(() => {
    if (!modalNovaAberto) {
      setDadosNovaViagem(null);
      return;
    }

    let ativo = true;
    Promise.all([
      veiculosApi.listar(),
      motoristasApi.listar(),
      // Solicitações administrativas aprovadas só interessam a quem agenda a frota administrativa
      (podeAgendar ? solicitacoesApi.listarAprovadas() : Promise.resolve([]))
        .then((solicitacoes) => ({ solicitacoes, erroSolicitacoes: null }))
        .catch((error) => ({
          solicitacoes: [],
          erroSolicitacoes: mensagemDeErro(error),
        })),
    ])
      .then(([veiculos, motoristas, resultado]) => {
        if (ativo) setDadosNovaViagem({ veiculos, motoristas, ...resultado });
      })
      .catch((error) => {
        if (!ativo) return;
        setModalNovaAberto(false);
        exibirFeedback(mensagemDeErro(error), true);
      });

    return () => {
      ativo = false;
    };
  }, [modalNovaAberto, podeAgendar]);

  const totais = useMemo(
    () => ({
      total: viagens.length,
      emAndamento: viagens.filter((v) => v.status === 'EM_ANDAMENTO').length,
      agendadas: viagens.filter((v) => v.status === 'AGENDADA').length,
      concluidas: viagens.filter((v) => v.status === 'CONCLUIDA').length,
    }),
    [viagens],
  );

  // Opções de motoristas e veículos extraídas das viagens registradas
  const opcoesMotoristas = useMemo(() => {
    const mapa = new Map<number, string>();
    viagens.forEach((v) => {
      if (v.motorista_id && v.motorista_nome) {
        mapa.set(v.motorista_id, v.motorista_nome);
      }
    });
    return Array.from(mapa.entries())
      .map(([id, nome]) => ({ value: String(id), label: nome }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [viagens]);

  const opcoesVeiculos = useMemo(() => {
    const mapa = new Map<number, { placa: string; modelo: string }>();
    viagens.forEach((v) => {
      if (v.veiculo_id && v.veiculo_placa) {
        mapa.set(v.veiculo_id, { placa: v.veiculo_placa, modelo: v.veiculo_modelo });
      }
    });
    return Array.from(mapa.entries())
      .map(([id, info]) => ({ value: String(id), label: `${info.placa} (${info.modelo})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [viagens]);

  const filtradas = useMemo(() => {
    return viagens.filter((v) => {
      if (filtroStatus !== 'TODOS' && v.status !== filtroStatus) return false;
      if (filtroMotorista !== 'TODOS' && String(v.motorista_id) !== filtroMotorista) return false;
      if (filtroVeiculo !== 'TODOS' && String(v.veiculo_id) !== filtroVeiculo) return false;

      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const matchOrigem = (v.origem ?? '').toLowerCase().includes(termo);
        const matchDestino = (v.destino ?? '').toLowerCase().includes(termo);
        const matchMotorista = v.motorista_nome.toLowerCase().includes(termo);
        const matchPlaca = v.veiculo_placa.toLowerCase().includes(termo);
        const matchSolicitante = (v.solicitante_nome ?? '').toLowerCase().includes(termo);
        if (!matchOrigem && !matchDestino && !matchMotorista && !matchPlaca && !matchSolicitante) {
          return false;
        }
      }
      return true;
    });
  }, [viagens, filtroStatus, filtroMotorista, filtroVeiculo, busca]);

  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 10;

  // Reseta para a página 1 ao alterar qualquer critério de filtro
  useEffect(() => {
    setPaginaAtual(1);
  }, [busca, filtroStatus, filtroMotorista, filtroVeiculo]);

  const totalItens = filtradas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / ITENS_POR_PAGINA));
  const paginaSegura = Math.min(paginaAtual, totalPaginas);

  const viagensPaginadas = useMemo(() => {
    const inicio = (paginaSegura - 1) * ITENS_POR_PAGINA;
    return filtradas.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [filtradas, paginaSegura]);

  const handleSalvarNovaViagem = async (nova: NovaViagemInput) => {
    await viagensApi.criar(nova);
    await carregarViagens();
    exibirFeedback(`Viagem agendada com sucesso!`);
  };

  const handleIniciarViagem = async (kmInicial: number) => {
    if (!viagemIniciar) return;
    await viagensApi.iniciar(viagemIniciar, kmInicial);
    await carregarViagens();
    exibirFeedback(`Viagem #${viagemIniciar.id} iniciada com sucesso.`);
  };

  const handleFinalizarViagem = async (kmFinal: number) => {
    if (!viagemFinalizar) return;
    await viagensApi.finalizar(viagemFinalizar, kmFinal);
    await carregarViagens();
    exibirFeedback(`Viagem #${viagemFinalizar.id} finalizada com sucesso.`);
  };

  const handleConfirmarCancelamento = async () => {
    if (!viagemCancelar) return;
    setCancelandoViagem(true);
    try {
      await viagensApi.cancelar(viagemCancelar);
      await carregarViagens();
      exibirFeedback(`Viagem #${viagemCancelar.id} cancelada.`);
      setViagemCancelar(null);
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
      setViagemCancelar(null);
    } finally {
      setCancelandoViagem(false);
    }
  };

  const handleColetaAgendada = async () => {
    await Promise.all([carregarViagens(), carregarPendentes()]);
    exibirFeedback('Coleta agendada com sucesso!');
  };

  return (
    <div className="grid w-full min-w-0 gap-5">
      {mensagemSucesso && <Alert tone="success">{mensagemSucesso}</Alert>}

      {mensagemErro && <Alert tone="danger">{mensagemErro}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          label={textos.total}
          value={totais.total}
          tone="neutral"
          className="px-5 py-4"
        />
        <MetricCard
          label="Em Andamento"
          value={totais.emAndamento}
          tone="primary"
          className="px-5 py-4"
        />
        <MetricCard
          label="Agendadas"
          value={totais.agendadas}
          tone="purple"
          className="px-5 py-4"
        />
        <MetricCard
          label="Concluídas"
          value={totais.concluidas}
          tone="success"
          className="px-5 py-4"
        />
      </div>

      {somenteProprias && (
        <Alert tone="info">
          Aqui aparecem só as viagens administrativas das solicitações feitas por você.
        </Alert>
      )}

      {podeAlocarSvo && (
        <Card>
          <div className="flex flex-col gap-1 border-b border-divider px-3.5 py-3 md:px-6">
            <h2 className="text-[15px] font-bold text-text md:text-base">
              Aguardando agendamento
            </h2>
            <p className="text-xs text-text-muted">
              Ordens de coleta geradas na confirmação das solicitações SVO, ainda sem veículo e
              motorista.
            </p>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Ordem</th>
                <th>Local da ocorrência</th>
                <th>Confirmada em</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500">
                    {carregandoPendentes
                      ? 'Carregando ordens...'
                      : erroPendentes
                        ? `Não foi possível carregar as ordens: ${erroPendentes}`
                        : 'Nenhuma ordem aguardando agendamento.'}
                  </td>
                </tr>
              ) : (
                pendentes.map((o) => (
                  <tr key={`pendente-${o.solicitacao_id}`}>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {o.ordem_id !== null && <IdBadge id={`#${o.ordem_id}`} />}
                        <span className="text-[11px] text-slate-500">
                          Solicitação #{o.solicitacao_id}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="block max-w-xs truncate" title={o.local_ocorrencia}>
                        {o.local_ocorrencia}
                      </span>
                      {o.material_sensivel && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertTriangle size={12} /> Material sensível
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatarDataHora(o.confirmado_em)}</td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="sm" onClick={() => setOrdemAgendar(o)}>
                        <CalendarClock size={13} className="mr-1" /> Agendar coleta
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <TableToolbar
          title={textos.titulo}
          subtitle={`${filtradas.length} de ${viagens.length} ${textos.registro}`}
          actions={!somenteProprias ? <BotaoExportarRelatorio tipo="viagens" /> : undefined}
          newLabel={podeAgendar ? 'Agendar Viagem' : undefined}
          onNew={podeAgendar ? () => setModalNovaAberto(true) : undefined}
          onFilter={() => setFiltrosAbertos((f) => !f)}
          isFilterActive={
            filtroStatus !== 'TODOS' ||
            filtroMotorista !== 'TODOS' ||
            filtroVeiculo !== 'TODOS' ||
            Boolean(busca) ||
            filtrosAbertos
          }
        />

        <TableFilterCollapse isOpen={filtrosAbertos}>
          {/* Busca por campo de texto na esquerda */}
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por trajeto, condutor ou placa..."
          />

          {/* Filtros em dropdown na sequência */}
          <FilterSelect
            aria-label="Filtrar por status"
            value={filtroStatus}
            onChange={(val) => setFiltroStatus(val as FiltroStatusViagem)}
            options={[
              { value: 'TODOS', label: 'Todos os status' },
              { value: 'AGENDADA', label: 'Agendadas' },
              { value: 'EM_ANDAMENTO', label: 'Em Andamento' },
              { value: 'CONCLUIDA', label: 'Concluídas' },
              { value: 'CANCELADA', label: 'Canceladas' },
            ]}
          />

          <FilterSelect
            aria-label="Filtrar por motorista"
            value={filtroMotorista}
            onChange={setFiltroMotorista}
            options={[
              { value: 'TODOS', label: 'Todos os motoristas' },
              ...opcoesMotoristas,
            ]}
          />

          <FilterSelect
            aria-label="Filtrar por veículo"
            value={filtroVeiculo}
            onChange={setFiltroVeiculo}
            options={[
              { value: 'TODOS', label: 'Todos os veículos' },
              ...opcoesVeiculos,
            ]}
          />

          {(filtroStatus !== 'TODOS' ||
            filtroMotorista !== 'TODOS' ||
            filtroVeiculo !== 'TODOS' ||
            busca) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca('');
                setFiltroStatus('TODOS');
                setFiltroMotorista('TODOS');
                setFiltroVeiculo('TODOS');
              }}
            >
              Limpar
            </Button>
          )}
        </TableFilterCollapse>

        <Table>
          <colgroup>
            <col className="w-[65px]" />
            <col className="w-[85px]" />
            <col className="w-auto" />
            <col className="w-[140px]" />
            <col className="w-[160px]" />
            <col className="w-[120px]" />
            <col className="w-[130px]" />
            <col className="w-[120px]" />
            <col className="w-[200px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="pr-1.5">ID</th>
              <th className="px-1.5 pr-3">Operação</th>
              <th>Origem / Destino</th>
              <th>Horários</th>
              <th>Motorista</th>
              <th>Veículo</th>
              <th>Odômetro / Km</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-9 text-center text-slate-500">
                  {carregando ? textos.carregando : (erroCarga ?? textos.vazio)}
                </td>
              </tr>
            ) : (
              viagensPaginadas.map((v) => {
                const kmRodados =
                  v.km_final !== null && v.km_final !== undefined && v.km_inicial !== null
                    ? v.km_final - v.km_inicial
                    : null;
                const chave = chaveViagem(v);

                return (
                  <tr
                    key={chave}
                    onClick={() => setViagemDetalhes(v)}
                    className="group cursor-pointer transition-colors duration-150 hover:!bg-surface-hover"
                    title="Clique para ver os detalhes da viagem"
                  >
                      <td className="pr-1.5">
                        <IdBadge id={`#${v.id}`} />
                      </td>
                      <td className="px-1.5 pr-3">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap uppercase',
                            v.tipo_operacao === 'ADMINISTRATIVA'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-violet-50 text-violet-700',
                          )}
                        >
                          {v.tipo_operacao === 'ADMINISTRATIVA' ? 'Frota' : 'SVO'}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={13} className="shrink-0 text-primary" />
                            <span
                              className="truncate text-xs leading-tight font-semibold text-slate-900"
                              title={v.origem ?? undefined}
                            >
                              {limitarTexto(v.origem, 26)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 pl-2">
                            <span className="shrink-0 text-[11px] text-slate-400">↳</span>
                            <span
                              className="truncate text-xs leading-tight text-slate-500"
                              title={v.destino ?? undefined}
                            >
                              {limitarTexto(v.destino, 26)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5 text-xs whitespace-nowrap">
                          {v.status === 'AGENDADA' ? (
                            <>
                              <span className="font-semibold text-purple">
                                <span className="text-[11px] font-medium text-slate-500">
                                  Partida:{' '}
                                </span>
                                {formatarDataHora(v.inicio_previsto ?? v.data_hora_efetiva_saida)}
                              </span>
                              <span className="text-[11px] text-slate-500">Aguardando saída</span>
                            </>
                          ) : (
                            <>
                              <span className="text-slate-900">
                                <span className="text-[11px] text-slate-500">Saída: </span>
                                {formatarDataHora(v.data_hora_efetiva_saida)}
                              </span>
                              {v.data_hora_efetiva_chegada ? (
                                <span className="text-slate-500">
                                  <span className="text-[11px] text-slate-500">Chegada: </span>
                                  {formatarDataHora(v.data_hora_efetiva_chegada)}
                                </span>
                              ) : (
                                v.status === 'EM_ANDAMENTO' && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    Em trânsito
                                  </span>
                                )
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className="block max-w-[170px] truncate text-[13px] font-medium text-slate-900"
                          title={v.motorista_nome}
                        >
                          {v.motorista_nome}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5 whitespace-nowrap">
                          <span
                            className="text-[13px] font-medium text-slate-900 leading-tight"
                            title={v.veiculo_modelo}
                          >
                            {v.veiculo_modelo}
                          </span>
                          <span className="w-fit rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                            {v.veiculo_placa}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5 whitespace-nowrap">
                          {kmRodados !== null ? (
                            <>
                              <span className="text-xs font-bold text-emerald-700">
                                {kmRodados} km rodados
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                {v.km_inicial?.toLocaleString('pt-BR')} →{' '}
                                {v.km_final?.toLocaleString('pt-BR')} km
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-semibold text-slate-900">
                                {v.km_inicial !== null
                                  ? `${v.km_inicial.toLocaleString('pt-BR')} km`
                                  : '—'}
                              </span>
                              <span className="text-[10px] text-slate-500">Odômetro inicial</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <Badge tone={obterBadgeToneStatus(v.status)}>
                          {LABELS_STATUS_VIAGEM[v.status]}
                        </Badge>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          {v.status === 'AGENDADA' && (
                            <>
                              {podeExecutar && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViagemIniciar(v);
                                  }}
                                  title="Registrar saída da viagem"
                                >
                                  <Play size={13} className="mr-1" /> Iniciar
                                </Button>
                              )}
                              {podeCancelar && (
                                <Button
                                  variant="danger-outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViagemCancelar(v);
                                  }}
                                  title="Cancelar viagem e liberar veículo e motorista"
                                >
                                  Cancelar
                                </Button>
                              )}
                            </>
                          )}
                          {v.status === 'EM_ANDAMENTO' && podeExecutar && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViagemFinalizar(v);
                              }}
                              title="Registrar retorno da viagem"
                            >
                              <Flag size={13} className="mr-1" /> Finalizar
                            </Button>
                          )}
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:bg-primary/10 group-hover:text-primary"
                            title="Ver detalhes da viagem"
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

        <Pagination
          currentPage={paginaSegura}
          totalItems={filtradas.length}
          pageSize={ITENS_POR_PAGINA}
          onPageChange={setPaginaAtual}
        />
      </Card>

      {/* Modais */}
      {modalNovaAberto && dadosNovaViagem && (
        <ModalNovaViagem
          solicitacoesAprovadas={dadosNovaViagem.solicitacoes}
          erroSolicitacoes={dadosNovaViagem.erroSolicitacoes}
          veiculos={dadosNovaViagem.veiculos}
          motoristas={dadosNovaViagem.motoristas}
          solicitacaoIdInicial={location.state?.solicitacaoId}
          tiposPermitidos={['ADMINISTRATIVA']}
          onClose={() => setModalNovaAberto(false)}
          onSalvar={handleSalvarNovaViagem}
        />
      )}

      {dadosAgendarColeta && (
        <ModalAgendarColetaSvo
          ordem={dadosAgendarColeta.ordem}
          veiculos={dadosAgendarColeta.veiculos}
          motoristas={dadosAgendarColeta.motoristas}
          onClose={() => setOrdemAgendar(null)}
          onAgendada={handleColetaAgendada}
        />
      )}

      {/* Drawer de Detalhes da Viagem */}
      <DrawerDetalhesViagem
        viagem={viagemDetalhes}
        onClose={() => setViagemDetalhes(null)}
        onIniciar={
          podeExecutar
            ? (v) => {
                setViagemDetalhes(null);
                setViagemIniciar(v);
              }
            : undefined
        }
        onFinalizar={
          podeExecutar
            ? (v) => {
                setViagemDetalhes(null);
                setViagemFinalizar(v);
              }
            : undefined
        }
        onCancelar={
          podeCancelar
            ? (v) => {
                setViagemDetalhes(null);
                setViagemCancelar(v);
              }
            : undefined
        }
      />

      {viagemIniciar && (
        <ModalIniciarViagem
          viagem={viagemIniciar}
          onClose={() => setViagemIniciar(null)}
          onSalvar={handleIniciarViagem}
        />
      )}

      {viagemFinalizar && (
        <ModalFinalizarViagem
          viagem={viagemFinalizar}
          onClose={() => setViagemFinalizar(null)}
          onSalvar={handleFinalizarViagem}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(viagemCancelar)}
        title="Cancelar Viagem"
        description={
          viagemCancelar
            ? `Tem certeza que deseja cancelar a viagem #${viagemCancelar.id}? O veículo (${viagemCancelar.veiculo_placa}) e o motorista (${viagemCancelar.motorista_nome}) serão liberados.`
            : ''
        }
        confirmLabel="Sim, Cancelar Viagem"
        cancelLabel="Voltar"
        variant="danger"
        isLoading={cancelandoViagem}
        onConfirm={handleConfirmarCancelamento}
        onClose={() => setViagemCancelar(null)}
      />
    </div>
  );
}
