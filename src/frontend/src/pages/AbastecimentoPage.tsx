import { useState, useMemo } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  IdBadge,
  MetricCard,
  Pagination,
  SearchInput,
  Table,
  TableFilterCollapse,
  TableToolbar,
} from '../components/ui';
import type { Abastecimento, NovoAbastecimentoInput } from '../types/abastecimento';
import { storageService } from '../services/storageService';
import { cn } from '../utils/cn';
import { ModalAbastecimento } from './abastecimento/ModalAbastecimento';

const CATEGORIAS_CUSTO = [
  { label: 'Caminhões', value: 'R$ 10.689', share: '58%', dotClass: 'bg-[#2D5F9F]' },
  { label: 'Vans', value: 'R$ 5.898', share: '32%', dotClass: 'bg-[#7597C1]' },
  { label: 'Utilitários', value: 'R$ 1.843', share: '10%', dotClass: 'bg-[#BCC9D8]' },
] as const;

export default function AbastecimentoPage() {
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>(
    storageService.getAbastecimentos(),
  );
  const [modalAberto, setModalAberto] = useState(false);
  const [abastecimentoExcluir, setAbastecimentoExcluir] = useState<Abastecimento | null>(null);
  const [busca, setBusca] = useState('');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
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

  // KPIs do topo calculados dinamicamente
  const kpis = useMemo(() => {
    const totalGasto = abastecimentos.reduce((acc, a) => acc + Number(a.valor_total), 0);
    const volumeTotal = abastecimentos.reduce((acc, a) => acc + Number(a.litros), 0);
    const consumos = abastecimentos
      .map((a) => a.consumo_kml)
      .filter((c): c is number => typeof c === 'number' && c > 0);
    const mediaConsumo =
      consumos.length > 0 ? consumos.reduce((a, b) => a + b, 0) / consumos.length : 8.7;
    const pendentes = abastecimentos.filter((a) => a.status === 'PENDENTE');
    const valorPendentes = pendentes.reduce((acc, a) => acc + Number(a.valor_total), 0);

    return {
      gastoMes: totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      volumeMes: `${volumeTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L`,
      registrosTotal: `${abastecimentos.length} registros`,
      mediaFrota: `${mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/L`,
      qtdPendentes: pendentes.length,
      valorPendentes: valorPendentes.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    };
  }, [abastecimentos]);

  // Lista analítica de consumo por veículo
  const consumoPorVeiculo = useMemo(() => {
    const map = new Map<string, { totalLitros: number; totalKm: number; consumo: number }>();
    abastecimentos.forEach((a) => {
      const placa = a.veiculo_placa ?? 'OUTRO';
      const c = a.consumo_kml ?? 8.5;
      if (!map.has(placa)) {
        map.set(placa, { totalLitros: a.litros, totalKm: a.quilometragem, consumo: c });
      }
    });

    const lista = Array.from(map.entries()).map(([placa, data]) => {
      const consumo = data.consumo;
      const belowTarget = consumo < 8.5;
      const pct = Math.min(Math.round((consumo / 12) * 100), 100);
      return {
        placa,
        value: consumo.toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
        width: `${pct}%`,
        belowTarget,
      };
    });

    return lista.slice(0, 6);
  }, [abastecimentos]);

  // Filtragem da tabela
  const abastecimentosFiltrados = useMemo(() => {
    if (!busca.trim()) return abastecimentos;
    const term = busca.toLowerCase();
    return abastecimentos.filter(
      (a) =>
        a.veiculo_placa?.toLowerCase().includes(term) ||
        a.motorista_nome?.toLowerCase().includes(term) ||
        a.posto_combustivel?.toLowerCase().includes(term) ||
        String(a.id).includes(term),
    );
  }, [abastecimentos, busca]);

  const handleSalvarAbastecimento = (novo: NovoAbastecimentoInput) => {
    try {
      const criado = storageService.createAbastecimento(novo);
      setAbastecimentos(storageService.getAbastecimentos());
      exibirFeedback(
        `Abastecimento ABS-${String(criado.id).padStart(4, '0')} registrado com sucesso!`,
      );
    } catch (error: any) {
      exibirFeedback(error.message || 'Erro ao registrar abastecimento.', true);
    }
  };

  const handleConfirmarExclusao = () => {
    if (!abastecimentoExcluir) return;
    try {
      storageService.deleteAbastecimento(abastecimentoExcluir.id);
      setAbastecimentos(storageService.getAbastecimentos());
      exibirFeedback('Abastecimento removido com sucesso.');
    } catch (error: any) {
      exibirFeedback(error.message || 'Erro ao excluir abastecimento.', true);
    } finally {
      setAbastecimentoExcluir(null);
    }
  };

  return (
    <div className="grid gap-6">
      {/* Feedback de sucesso e erro */}
      {(mensagemSucesso || mensagemErro) && (
        <Alert tone={mensagemErro ? 'danger' : 'success'}>{mensagemErro || mensagemSucesso}</Alert>
      )}

      {/* ── 4 Top KPI Cards (2x2 no mobile) ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          label="Gasto no mês"
          value={kpis.gastoMes}
          subtitle="Total consolidado"
          tone="neutral"
        />

        <MetricCard
          label="Volume no mês"
          value={kpis.volumeMes}
          subtitle={kpis.registrosTotal}
          tone="neutral"
        />

        <MetricCard
          label="Média da frota"
          value={kpis.mediaFrota}
          subtitle="Meta mensal: 8,5 km/L"
          tone="neutral"
        />

        <MetricCard
          label="Pendentes"
          value={kpis.qtdPendentes}
          subtitle={`${kpis.valorPendentes} para validar`}
          tone="warning"
        />
      </div>

      {/* ── Gráficos Analíticos (Widgets Intermediários) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Widget 1: Consumo por Veículo */}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="font-display text-[15px] font-bold text-slate-900">
                Consumo por veículo
              </div>
              <div className="mt-1 text-xs text-slate-500">Média registrada no mês, em km/L</div>
            </div>
            <span className="text-xs font-medium text-slate-500">Outubro de 2026</span>
          </div>

          <div className="grid grid-cols-1 gap-x-7 gap-y-4 sm:grid-cols-2">
            {consumoPorVeiculo.map((item) => (
              <div key={item.placa}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[13px] font-semibold text-slate-900">
                    {item.placa}
                  </span>
                  <span
                    className={cn(
                      'font-display text-xs font-semibold',
                      item.belowTarget ? 'text-amber-700' : 'text-slate-600',
                    )}
                  >
                    {item.value} km/L
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-400',
                      item.belowTarget ? 'bg-[#C58A42]' : 'bg-primary',
                    )}
                    style={{ width: item.width }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Widget 2: Distribuição de Custos */}
        <Card className="p-6">
          <div className="font-display text-[15px] font-bold text-slate-900">
            Distribuição de custos
          </div>
          <div className="mt-1 mb-5 text-xs text-slate-500">Participação por categoria</div>

          {/* Barra segmentada */}
          <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="w-[58%] bg-[#2D5F9F]" />
            <div className="w-[32%] bg-[#7597C1]" />
            <div className="w-[10%] bg-[#BCC9D8]" />
          </div>

          {/* Legenda de categorias */}
          <div className="flex flex-col gap-3">
            {CATEGORIAS_CUSTO.map((cat) => (
              <div key={cat.label} className="flex items-center gap-2.5">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', cat.dotClass)} />
                <span className="flex-1 text-[13px] text-slate-600">{cat.label}</span>
                <span className="text-[13px] font-semibold text-slate-900">{cat.value}</span>
                <span className="w-8 text-right text-xs text-slate-400">{cat.share}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Tabela de Histórico ── */}
      <Card>
        <TableToolbar
          title="Histórico de abastecimentos"
          subtitle={`${abastecimentosFiltrados.length} registros recentes`}
          newLabel="Novo Abastecimento"
          onNew={() => setModalAberto(true)}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={Boolean(busca) || filtrosAbertosMobile}
        />

        {/* Campo de busca e filtro rápido */}
        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por placa, motorista ou posto..."
          />
        </TableFilterCollapse>

        <Table>
          <thead>
            <tr>
              <th>Registro</th>
              <th>Data</th>
              <th>Veículo</th>
              <th>Motorista / Posto</th>
              <th>Volume</th>
              <th>Valor / Litro</th>
              <th>Total</th>
              <th>Consumo</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {abastecimentosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  Nenhum registro de abastecimento encontrado.
                </td>
              </tr>
            ) : (
              abastecimentosFiltrados.map((a) => {
                const consumoVal = a.consumo_kml ?? 8.5;
                const abaixoMeta = consumoVal < 8.5;

                return (
                  <tr key={a.id}>
                    <td>
                      <IdBadge id={`ABS-${String(a.id).padStart(4, '0')}`} />
                    </td>
                    <td>
                      <span className="text-[13px] whitespace-nowrap text-slate-500">
                        {a.data_abastecimento.includes('-')
                          ? a.data_abastecimento.split('-').reverse().join('/')
                          : a.data_abastecimento}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[13px] font-semibold text-slate-900">
                          {a.veiculo_placa ?? 'N/D'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {a.quilometragem.toLocaleString('pt-BR')} km
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-slate-700">
                          {a.motorista_nome ?? 'N/D'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {a.posto_combustivel ?? 'Posto não informado'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-[13px] font-semibold text-slate-700">
                        {Number(a.litros).toLocaleString('pt-BR', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 2,
                        })}{' '}
                        L
                      </span>
                    </td>
                    <td>
                      <span className="text-[13px] text-slate-500">
                        {Number(a.valor_litro ?? a.valor_total / (a.litros || 1)).toLocaleString(
                          'pt-BR',
                          {
                            style: 'currency',
                            currency: 'BRL',
                          },
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="font-display text-[13px] font-bold whitespace-nowrap text-slate-900">
                        {Number(a.valor_total).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'text-[13px] font-semibold whitespace-nowrap',
                          abaixoMeta ? 'text-amber-700' : 'text-emerald-700',
                        )}
                      >
                        {consumoVal.toLocaleString('pt-BR', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}{' '}
                        km/L
                      </span>
                    </td>
                    <td>
                      <Badge tone={a.status === 'CONFIRMADO' ? 'success' : 'warning'}>
                        {a.status === 'CONFIRMADO' ? 'Validado' : 'Pendente'}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="danger-outline"
                          size="sm"
                          onClick={() => setAbastecimentoExcluir(a)}
                          title="Excluir abastecimento"
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
          showing={`1–${abastecimentosFiltrados.length}`}
          total={abastecimentosFiltrados.length}
        />
      </Card>

      {/* Modal de Cadastro */}
      {modalAberto && (
        <ModalAbastecimento
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvarAbastecimento}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(abastecimentoExcluir)}
        title="Excluir Abastecimento"
        description={
          abastecimentoExcluir
            ? `Tem certeza que deseja excluir o abastecimento ABS-${String(abastecimentoExcluir.id).padStart(4, '0')}?`
            : ''
        }
        confirmLabel="Sim, Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmarExclusao}
        onClose={() => setAbastecimentoExcluir(null)}
      />
    </div>
  );
}
