import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarClock, ChevronRight, Flag, MapPin, Play } from 'lucide-react';
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
import { ApiError, mensagemDeErro } from '../services/api/http';
import { recursoAtivo } from '../config/recursosBackend';
import { motoristasApi } from '../services/api/motoristasApi';
import { solicitacoesApi } from '../services/api/solicitacoesApi';
import { veiculosApi } from '../services/api/veiculosApi';
import { viagensApi } from '../services/api/viagensApi';
import type { Motorista } from '../types/motorista';
import type { SolicitacaoViagem } from '../types/solicitacao';
import type { Veiculo } from '../types/veiculo';
import {
  rotuloStatusViagem,
  viagemEmCurso,
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
import { ModalEvidenciasOdometro } from './viagens/ModalEvidenciasOdometro';
import { ModalNovaViagem } from './viagens/ModalNovaViagem';
import { usePermissao } from '../utils/permissoes';

type FiltroStatusViagem = 'TODOS' | 'AGENDADA' | 'EM_ANDAMENTO' | 'NO_LOCAL' | 'CONCLUIDA' | 'CANCELADA';

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
    case 'NO_LOCAL':
      return 'warning';
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
  const { pode, podeNaFrota } = usePermissao();
  const isSvo = operacao === 'SVO';
  const agendaSvoAtiva = recursoAtivo('agendamentoTemporalSvo');
  // Fotos do odômetro (SCRUM-203): cada gestor só na própria operação; o Administrador nas duas
  const podeVerFotos =
    recursoAtivo('fotosOdometro') && !somenteProprias && podeNaFrota('evidenciasOdometro.ver', operacao);
  const textos = TEXTOS_OPERACAO[operacao];
  // Agendar viagem administrativa (Admin e Gestor de Frota); alocar coleta SVO (Admin e Gestor SVO)
  const podeAgendar = !isSvo && !somenteProprias && pode('viagens.agendar');
  const podeAlocarSvo = isSvo && pode('viagens.alocarSvo');
  const podeCancelar = !somenteProprias && pode('viagens.cancelar');
  // Motoristas registram saída e retorno das próprias viagens (a API só lista as deles). Na SVO,
  // só o Motorista SVO executa; gestores e Administrador acompanham sem as ações operacionais.
  const podeExecutar =
    !somenteProprias && (isSvo ? pode('viagens.executarSvo') : pode('viagens.executar'));
  const podeRegistrarChegada = isSvo && agendaSvoAtiva && podeExecutar;
  const chegadasEmEnvio = useRef(new Set<number>());
  const [chegadasPendentes, setChegadasPendentes] = useState<ReadonlySet<number>>(() => new Set());
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
  const [viagemReprogramar, setViagemReprogramar] = useState<Viagem | null>(null);
  const [alertasSvo, setAlertasSvo] = useState<Awaited<ReturnType<typeof viagensApi.listarAlertasSvo>>>([]);
  const [erroAlertas, setErroAlertas] = useState<string | null>(null);
  const [dadosAgendarColeta, setDadosAgendarColeta] = useState<DadosAgendarColeta | null>(null);

  useEffect(() => {
    if (location.state?.solicitacaoId && podeAgendar) {
      setModalNovaAberto(true);
    }
  }, [location.state, podeAgendar]);
  const [chaveDetalhes, setChaveDetalhes] = useState<string | null>(null);
  const viagemDetalhes = viagens.find((v) => chaveViagem(v) === chaveDetalhes) ?? null;
  const [viagemIniciar, setViagemIniciar] = useState<Viagem | null>(null);
  const [viagemFinalizar, setViagemFinalizar] = useState<Viagem | null>(null);
  const [viagemFotos, setViagemFotos] = useState<Viagem | null>(null);
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
    if (podeAlocarSvo && agendaSvoAtiva) {
      try {
        setAlertasSvo(await viagensApi.listarAlertasSvo());
        setErroAlertas(null);
      } catch (error) {
        setErroAlertas(mensagemDeErro(error));
      }
    }
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
  }, [operacao, somenteProprias, podeAlocarSvo, agendaSvoAtiva]);

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
    if (!agendaSvoAtiva || atalhoUsado || !solicitacaoSvoDoAtalho || carregandoPendentes) return;
    const ordem = pendentes.find((p) => p.solicitacao_id === solicitacaoSvoDoAtalho);
    if (ordem) setOrdemAgendar(ordem);
    setAtalhoUsado(true);
  }, [agendaSvoAtiva, atalhoUsado, solicitacaoSvoDoAtalho, carregandoPendentes, pendentes]);

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
      emAndamento: viagens.filter((v) => viagemEmCurso(v.status)).length,
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

  const handleIniciarViagem = async (kmInicial: number, evidenciaId?: string) => {
    if (!viagemIniciar) return;
    await viagensApi.iniciar(viagemIniciar, kmInicial, evidenciaId);
    await carregarViagens();
    exibirFeedback(`Viagem #${viagemIniciar.id} iniciada com sucesso.`);
  };

  const handleRegistrarChegada = async (viagem: Viagem) => {
    const { id, status, tipo_operacao } = viagem;
    const envios = chegadasEmEnvio.current;
    if (!podeRegistrarChegada || tipo_operacao !== 'SVO' || status !== 'EM_ANDAMENTO' || envios.has(id)) return;

    const chave = chaveViagem(viagem);
    envios.add(id);
    setChegadasPendentes(new Set(envios));

    try {
      const atualizada = await viagensApi.registrarChegadaLocalSvo(id);
      if (atualizada?.status !== 'NO_LOCAL' || chaveViagem(atualizada) !== chave) {
        throw new Error('O servidor não confirmou a chegada. Consulte o status da coleta.');
      }
      setViagens((lista) => lista.map((v) => chaveViagem(v) === chave ? atualizada : v));
      exibirFeedback('Chegada ao local registrada.');
    } catch (error) {
      const statusHttp = error instanceof ApiError ? error.status : undefined;
      const mensagem =
        statusHttp !== undefined && statusHttp >= 500
          ? 'O servidor não conseguiu confirmar a chegada. Tente novamente.'
          : mensagemDeErro(error);
      if (statusHttp === 409 || statusHttp === 404) {
        try {
          const listaAtual = await viagensApi.listar();
          const coletaAtual = listaAtual.find((v) => chaveViagem(v) === chave);
          setViagens((lista) => lista.flatMap((v) =>
            chaveViagem(v) === chave ? (coletaAtual ? [coletaAtual] : []) : [v],
          ));
        } catch {
          exibirFeedback(`${mensagem} Não foi possível atualizar o status da coleta.`, true);
          return;
        }
      }
      exibirFeedback(mensagem, true);
    } finally {
      envios.delete(id);
      setChegadasPendentes(new Set(envios));
    }
  };

  const handleFinalizarViagem = async (kmFinal: number, evidenciaId?: string) => {
    if (!viagemFinalizar) return;
    await viagensApi.finalizar(viagemFinalizar, kmFinal, evidenciaId);
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
      {isSvo && !agendaSvoAtiva && <Alert tone="info">Agendamento e operações de coleta SVO indisponíveis até a atualização do banco de dados.</Alert>}
      {erroAlertas && <Alert tone="warning">Não foi possível atualizar os alertas SVO: {erroAlertas}</Alert>}
      {alertasSvo.map((alerta) => (
        <Alert key={alerta.id} tone="warning">
          A coleta #{alerta.ordem_em_atraso_id} está atrasada e afeta a coleta #{alerta.ordem_afetada_id},
          prevista para {formatarDataHora(alerta.inicio_previsto_afetada)}.
        </Alert>
      ))}
      {!viagemDetalhes && mensagemSucesso && <Alert tone="success">{mensagemSucesso}</Alert>}
      {!viagemDetalhes && mensagemErro && <Alert tone="danger">{mensagemErro}</Alert>}

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
                    </td>
                    <td className="whitespace-nowrap">{formatarDataHora(o.confirmado_em)}</td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="sm" disabled={!agendaSvoAtiva} onClick={() => setOrdemAgendar(o)}>
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
            placeholder={somenteProprias ? 'Buscar por trajeto...' : 'Buscar por trajeto, condutor ou placa...'}
          />

          {/* Filtros em dropdown na sequência */}
          <FilterSelect
            aria-label="Filtrar por status"
            value={filtroStatus}
            onChange={(val) => setFiltroStatus(val as FiltroStatusViagem)}
            options={[
              { value: 'TODOS', label: 'Todos os status' },
              { value: 'AGENDADA', label: 'Agendadas' },
              { value: 'EM_ANDAMENTO', label: isSvo ? 'A caminho' : 'Em Andamento' },
              ...(isSvo ? [{ value: 'NO_LOCAL', label: 'No local' }] : []),
              { value: 'CONCLUIDA', label: 'Concluídas' },
              { value: 'CANCELADA', label: 'Canceladas' },
            ]}
          />

          {!somenteProprias && <FilterSelect
            aria-label="Filtrar por motorista"
            value={filtroMotorista}
            onChange={setFiltroMotorista}
            options={[
              { value: 'TODOS', label: 'Todos os motoristas' },
              ...opcoesMotoristas,
            ]}
          />}

          {!somenteProprias && <FilterSelect
            aria-label="Filtrar por veículo"
            value={filtroVeiculo}
            onChange={setFiltroVeiculo}
            options={[
              { value: 'TODOS', label: 'Todos os veículos' },
              ...opcoesVeiculos,
            ]}
          />}

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
            {!somenteProprias && <><col className="w-[160px]" /><col className="w-[120px]" /><col className="w-[130px]" /></>}
            <col className="w-[120px]" />
            <col className="w-[200px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="pr-1.5">ID</th>
              <th className="px-1.5 pr-3">Operação</th>
              <th>Origem / Destino</th>
              <th>Horários</th>
              {!somenteProprias && <><th>Motorista</th><th>Veículo</th><th>Odômetro / Km</th></>}
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={somenteProprias ? 6 : 9} className="p-9 text-center text-slate-500">
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
                    onClick={() => setChaveDetalhes(chave)}
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
                              {v.tipo_operacao === 'ADMINISTRATIVA' && v.material_sensivel && <span className="block text-xs font-semibold text-amber-700">Material sensível</span>}
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
                                viagemEmCurso(v.status) && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    {v.status === 'NO_LOCAL' ? 'No local da coleta' : 'Em trânsito'}
                                  </span>
                                )
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      {!somenteProprias && <><td>
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
                      </td></>}
                      <td>
                        <Badge tone={obterBadgeToneStatus(v.status)}>
                          {rotuloStatusViagem(v)}
                        </Badge>
                        {isSvo && agendaSvoAtiva && v.status === 'AGENDADA' && v.inicio_previsto && (
                          <span className="block text-xs text-slate-500">
                            {v.liberada_em ? 'Liberada para saída' : 'Aguardando liberação'}
                          </span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          {v.status === 'AGENDADA' && (
                            <>
                              {podeAlocarSvo && agendaSvoAtiva && (
                                <Button variant="outline" size="sm" onClick={(e) => {
                                  e.stopPropagation();
                                  setViagemReprogramar(v);
                                  setOrdemAgendar({ ordem_id: v.id, solicitacao_id: v.solicitacao_id,
                                    local_ocorrencia: v.destino ?? '', material_sensivel: false, confirmado_em: null });
                                }}>Reagendar coleta</Button>
                              )}
                              {podeExecutar && (!isSvo || agendaSvoAtiva) && (
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
                              {podeCancelar && (!isSvo || agendaSvoAtiva) && (
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
                          {podeRegistrarChegada && v.tipo_operacao === 'SVO' && v.status === 'EM_ANDAMENTO' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={chegadasPendentes.has(v.id)}
                              aria-busy={chegadasPendentes.has(v.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRegistrarChegada(v);
                              }}
                            >
                              {chegadasPendentes.has(v.id) ? 'Registrando chegada…' : 'Cheguei ao local'}
                            </Button>
                          )}
                          {viagemEmCurso(v.status) && podeExecutar && (!isSvo || agendaSvoAtiva) && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViagemFinalizar(v);
                              }}
                              disabled={isSvo && chegadasPendentes.has(v.id)}
                              title="Registrar retorno da viagem"
                            >
                              <Flag size={13} className="mr-1" /> Finalizar
                            </Button>
                          )}
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary group-hover:translate-x-0.5 group-hover:bg-primary/10 group-hover:text-primary"
                            title="Ver detalhes da viagem"
                            aria-label="Ver detalhes da viagem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setChaveDetalhes(chave);
                            }}
                          >
                            <ChevronRight size={15} aria-hidden="true" />
                          </button>
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
          viagemReprogramar={viagemReprogramar ?? undefined}
          veiculos={dadosAgendarColeta.veiculos}
          motoristas={dadosAgendarColeta.motoristas}
          onClose={() => { setOrdemAgendar(null); setViagemReprogramar(null); }}
          onAgendada={handleColetaAgendada}
          onAtualizarRecursos={async () => {
            const [veiculos, motoristas] = await Promise.all([veiculosApi.listar(), motoristasApi.listar()]);
            setDadosAgendarColeta((atual) => atual?.ordem === dadosAgendarColeta.ordem ? { ...atual, veiculos, motoristas } : atual);
          }}
        />
      )}

      {/* Drawer de Detalhes da Viagem */}
      <DrawerDetalhesViagem
        viagem={viagemDetalhes}
        somentePropria={somenteProprias}
        onClose={() => setChaveDetalhes(null)}
        onRegistrarChegada={podeRegistrarChegada ? handleRegistrarChegada : undefined}
        registrandoChegada={isSvo && viagemDetalhes !== null && chegadasPendentes.has(viagemDetalhes.id)}
        mensagemSucesso={mensagemSucesso}
        mensagemErro={mensagemErro}
        onIniciar={
          podeExecutar && (!isSvo || agendaSvoAtiva)
            ? (v) => {
                setChaveDetalhes(null);
                setViagemIniciar(v);
              }
            : undefined
        }
        onFinalizar={
          podeExecutar && (!isSvo || agendaSvoAtiva)
            ? (v) => {
                setChaveDetalhes(null);
                setViagemFinalizar(v);
              }
            : undefined
        }
        onCancelar={
          podeCancelar && (!isSvo || agendaSvoAtiva)
            ? (v) => {
                setChaveDetalhes(null);
                setViagemCancelar(v);
              }
            : undefined
        }
        onVerFotos={
          podeVerFotos
            ? (v) => {
                setChaveDetalhes(null);
                setViagemFotos(v);
              }
            : undefined
        }
      />

      {viagemFotos && (
        <ModalEvidenciasOdometro referencia={viagemFotos} onClose={() => setViagemFotos(null)} />
      )}

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
