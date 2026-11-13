import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { LABELS_STATUS_MULTA } from '../types/multa';
import type { Multa, NovaMultaInput, StatusPagamentoMulta } from '../types/multa';
import { multasApi } from '../services/api/multasApi';
import { veiculosApi } from '../services/api/veiculosApi';
import { motoristasApi } from '../services/api/motoristasApi';
import { documentosApi, type DocumentoComAlerta } from '../services/api/documentosApi';
import { mensagemDeErro } from '../services/api/http';
import { ModalMulta } from './multas/ModalMulta';
import { usePermissao } from '../utils/permissoes';

function formatarDataHora(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function MultasPage() {
  const [multas, setMultas] = useState<Multa[]>([]);
  const { pode, podeNaFrota } = usePermissao();
  const podeRegistrar = pode('multas.gerenciar');
  // Gestor SVO: só altera multas de veículos da frota SVO
  const podeGerenciar = (m: Multa) => podeNaFrota('multas.gerenciar', m.veiculo_tipo_frota);
  const [documentosAlerta, setDocumentosAlerta] = useState<DocumentoComAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [avisoDependencias, setAvisoDependencias] = useState<string | null>(null);

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

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      setErroCarga(null);
      setAvisoDependencias(null);

      const [resMultas, resVeiculos, resMotoristas, resDocs] = await Promise.allSettled([
        multasApi.listar(),
        veiculosApi.listar(),
        motoristasApi.listar(),
        documentosApi.listarVencimentos(),
      ]);

      if (resMultas.status === 'rejected') {
        throw resMultas.reason;
      }
      if (resVeiculos.status === 'rejected') {
        throw resVeiculos.reason;
      }

      const listaMultas = resMultas.value;
      const listaVeiculos = resVeiculos.value;
      const listaMotoristas = resMotoristas.status === 'fulfilled' ? resMotoristas.value : [];
      const listaDocs = resDocs.status === 'fulfilled' ? resDocs.value : [];

      if (resMotoristas.status === 'rejected' || resDocs.status === 'rejected') {
        setAvisoDependencias(
          'Algumas informações complementares (condutores ou alertas de vencimento) não puderam ser carregadas do servidor.'
        );
      }

      const mapaVeiculos = new Map(listaVeiculos.map((v) => [v.id, v]));
      const mapaMotoristas = new Map(listaMotoristas.map((m) => [m.id, m]));

      const enriquecidas: Multa[] = listaMultas.map((m) => {
        const v = mapaVeiculos.get(m.veiculo_id);
        const mot = m.motorista_id ? mapaMotoristas.get(m.motorista_id) : undefined;
        return {
          ...m,
          veiculo_placa: v?.placa,
          veiculo_modelo: v?.modelo,
          veiculo_tipo_frota: v?.tipo_frota,
          motorista_nome: mot?.nome,
        };
      });

      setMultas(enriquecidas);
      setDocumentosAlerta(listaDocs.filter((d) => d.status_vencimento !== 'VALIDO'));
    } catch (err) {
      const msg = mensagemDeErro(err);
      setErroCarga(msg);
      exibirFeedback(msg, true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

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

  const handleSalvar = async (dados: NovaMultaInput) => {
    try {
      if (multaEditando) {
        await multasApi.atualizar(multaEditando.id, dados);
        exibirFeedback(`Multa MLT-${String(multaEditando.id).padStart(4, '0')} atualizada com sucesso.`);
      } else {
        const criada = await multasApi.criar(dados);
        exibirFeedback(`Multa MLT-${String(criada.id).padStart(4, '0')} registrada com sucesso.`);
      }
      carregarDados();
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
      throw error;
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!multaExcluir) return;
    try {
      await multasApi.excluir(multaExcluir.id);
      exibirFeedback(`Multa MLT-${String(multaExcluir.id).padStart(4, '0')} excluída com sucesso.`);
      carregarDados();
    } catch (error) {
      exibirFeedback(mensagemDeErro(error), true);
    } finally {
      setMultaExcluir(null);
    }
  };

  return (
    <div className="grid gap-6">
      {feedback && <Alert tone={feedback.erro ? 'danger' : 'success'}>{feedback.msg}</Alert>}
      {avisoDependencias && <Alert tone="warning">{avisoDependencias}</Alert>}

      {/* Alerta Preventivo de Vencimento de CNH/CRLV (RN15) */}
      {documentosAlerta.length > 0 && (
        <Alert tone="warning">
          <strong>Atenção operacional (RN15):</strong> Existem {documentosAlerta.length}{' '}
          documento(s) com vencimento próximo (menos de 30 dias) ou vencidos na frota.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Multas registradas"
          value={kpis.total}
          tone="neutral"
          subtitle={`${kpis.qtdPendentes} pendentes de regularização`}
        />
        <MetricCard
          label="Total a pagar"
          value={kpis.valorPendentes}
          tone={kpis.qtdPendentes > 0 ? 'danger' : 'success'}
          subtitle="Valor acumulado pendente"
        />
        <MetricCard
          label="Sem condutor identificado"
          value={kpis.semMotorista}
          tone={kpis.semMotorista > 0 ? 'warning' : 'neutral'}
          subtitle="Risco de penalidade à instituição"
        />
      </div>

      <Card>
        <TableToolbar
          title="Multas & Autuações"
          subtitle={
            carregando
              ? 'Carregando autuações...'
              : `${filtradas.length} ${filtradas.length === 1 ? 'registro' : 'registros'}`
          }
          newLabel={podeRegistrar ? 'Registrar multa' : undefined}
          onNew={podeRegistrar ? abrirNova : undefined}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={temFiltro || filtrosAbertosMobile}
        />

        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por placa, condutor, código..."
          />

          <FilterSelect
            aria-label="Filtrar por status"
            value={filtroStatus}
            onChange={(val) => setFiltroStatus(val as '' | StatusPagamentoMulta)}
            options={[
              { value: '', label: 'Todos os status' },
              { value: 'PENDENTE', label: 'Pendente' },
              { value: 'PAGO', label: 'Paga' },
              { value: 'CANCELADO', label: 'Cancelada' },
            ]}
          />

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>De:</span>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="h-[38px] rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span>Até:</span>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="h-[38px] rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              <th>ID</th>
              <th>Data/Hora</th>
              <th>Veículo</th>
              <th>Condutor</th>
              <th>Infração / Órgão</th>
              <th>Valor</th>
              <th>Pontos</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={9} className="p-9 text-center text-slate-500">
                  Carregando autuações da API...
                </td>
              </tr>
            ) : erroCarga ? (
              <tr>
                <td colSpan={9} className="p-9 text-center text-rose-600">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="font-medium">Falha na comunicação com o servidor: {erroCarga}</p>
                    <Button variant="outline" size="sm" onClick={carregarDados}>
                      Tentar novamente
                    </Button>
                  </div>
                </td>
              </tr>
            ) : filtradas.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  {temFiltro ? 'Nenhuma multa corresponde aos filtros aplicados.' : 'Nenhuma multa registrada.'}
                </td>
              </tr>
            ) : (
              filtradas.map((m) => (
                <tr key={m.id}>
                  <td>
                    <IdBadge id={`MLT-${String(m.id).padStart(4, '0')}`} />
                  </td>
                  <td>
                    <div className="text-[13px] text-slate-700">{formatarDataHora(m.data_infracao)}</div>
                    {m.data_vencimento && (
                      <div className="text-[11px] text-slate-400">
                        Venc.: {new Date(m.data_vencimento).toLocaleDateString('pt-BR')}
                      </div>
                    )}
                  </td>
                  <td>
                    <div>
                      <span className="font-semibold text-slate-900">{m.veiculo_placa ?? 'N/D'}</span>
                      <div className="text-[11px] text-slate-500">{m.veiculo_modelo ?? ''}</div>
                    </div>
                  </td>
                  <td>
                    {m.motorista_nome ? (
                      <span className="text-[13px] text-slate-700">{m.motorista_nome}</span>
                    ) : (
                      <Badge tone="danger">
                        Não identificado
                      </Badge>
                    )}
                  </td>
                  <td>
                    <div className="text-[13px] text-slate-800">
                      {m.id_infracao ?? (m.descricao ? m.descricao.slice(0, 30) : '—')}
                    </div>
                    {m.orgao_autuador && (
                      <div className="text-[11px] text-slate-400">{m.orgao_autuador}</div>
                    )}
                  </td>
                  <td>
                    <span className="font-semibold text-slate-900">{brl(Number(m.valor))}</span>
                  </td>
                  <td>
                    <Badge tone={m.pontos >= 7 ? 'danger' : m.pontos >= 4 ? 'warning' : 'neutral'}>
                      {m.pontos} pts
                    </Badge>
                  </td>
                  <td>
                    <Badge
                      tone={
                        m.status_pagamento === 'PAGO'
                          ? 'success'
                          : m.status_pagamento === 'CANCELADO'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {LABELS_STATUS_MULTA[m.status_pagamento]}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex items-center justify-start gap-1.5">
                      {podeGerenciar(m) ? (
                        <>
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
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${filtradas.length}`} total={filtradas.length} />
      </Card>

      {modalAberto && (
        <ModalMulta
          multa={multaEditando}
          filtrarVeiculo={(v) => podeNaFrota('multas.gerenciar', v.tipo_frota)}
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvar}
        />
      )}

      {multaExcluir && (
        <ConfirmDialog
          isOpen={Boolean(multaExcluir)}
          title="Excluir multa"
          confirmLabel="Excluir"
          variant="danger"
          onClose={() => setMultaExcluir(null)}
          onConfirm={handleConfirmarExclusao}
          description={
            <span>
              Deseja realmente excluir a autuação <strong>MLT-{String(multaExcluir.id).padStart(4, '0')}</strong>?
            </span>
          }
        />
      )}
    </div>
  );
}
