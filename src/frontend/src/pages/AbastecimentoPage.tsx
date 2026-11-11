import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  IdBadge,
  MetricCard,
  Pagination,
  SearchInput,
  Table,
  TableFilterCollapse,
  TableToolbar,
} from '../components/ui';
import type { Abastecimento, NovoAbastecimentoInput } from '../types/abastecimento';
import type { Motorista } from '../types/motorista';
import { veiculosApi } from '../services/api/veiculosApi';
import { motoristasApi } from '../services/api/motoristasApi';
import { abastecimentosApi } from '../services/api/abastecimentosApi';
import { mensagemDeErro } from '../services/api/http';
import { cn } from '../utils/cn';
import { ModalAbastecimento } from './abastecimento/ModalAbastecimento';

interface AbastecimentoEnriquecido extends Abastecimento {
  veiculo_tipo_frota?: 'ADMINISTRATIVA' | 'SVO';
}

export default function AbastecimentoPage() {
  const [abastecimentos, setAbastecimentos] = useState<AbastecimentoEnriquecido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [avisoMotoristas, setAvisoMotoristas] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
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

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      setErroCarga(null);
      setAvisoMotoristas(null);

      const veiculos = await veiculosApi.listar();

      let motoristas: Motorista[] = [];
      let falhaMotoristas = false;
      try {
        motoristas = await motoristasApi.listar();
      } catch {
        try {
          const meuPerfil = await motoristasApi.buscarMeuPerfil();
          if (meuPerfil) {
            motoristas = [meuPerfil];
          } else {
            falhaMotoristas = true;
          }
        } catch {
          falhaMotoristas = true;
        }
      }

      if (falhaMotoristas) {
        setAvisoMotoristas('Não foi possível carregar os nomes de alguns condutores.');
      }

      const mapaVeiculos = new Map(veiculos.map((v) => [v.id, v]));
      const mapaMotoristas = new Map(motoristas.map((m) => [m.id, m]));

      const lista = await abastecimentosApi.listarTodos(veiculos.map((v) => v.id));

      const enriquecidos: AbastecimentoEnriquecido[] = lista.map((a) => {
        const v = mapaVeiculos.get(a.veiculo_id);
        const m = mapaMotoristas.get(a.motorista_id);
        return {
          ...a,
          veiculo_placa: v?.placa,
          veiculo_modelo: v?.modelo,
          veiculo_tipo_frota: v?.tipo_frota,
          motorista_nome: m?.nome,
        };
      });

      setAbastecimentos(enriquecidos);
      setMensagemErro(null);
    } catch (err) {
      const msg = mensagemDeErro(err);
      setErroCarga(msg);
      setMensagemErro(msg);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Cálculo de consumo real por veículo (delta KM / litros entre abastecimentos sucessivos)
  const consumoPorVeiculo = useMemo(() => {
    // Agrupa por veículo e ordena por KM crescente
    const porVeiculo = new Map<number, AbastecimentoEnriquecido[]>();
    abastecimentos.forEach((a) => {
      const arr = porVeiculo.get(a.veiculo_id) ?? [];
      arr.push(a);
      porVeiculo.set(a.veiculo_id, arr);
    });

    const listaConsumo: Array<{
      placa: string;
      consumoNum: number;
      value: string;
      width: string;
      belowTarget: boolean;
    }> = [];

    porVeiculo.forEach((listaAbast) => {
      if (listaAbast.length < 2) return;
      const ordenados = [...listaAbast].sort((a, b) => Number(a.quilometragem) - Number(b.quilometragem));
      let somaKm = 0;
      let somaLitros = 0;

      for (let i = 1; i < ordenados.length; i++) {
        const deltaKm = Number(ordenados[i].quilometragem) - Number(ordenados[i - 1].quilometragem);
        const litros = Number(ordenados[i].litros);
        if (deltaKm > 0 && litros > 0) {
          somaKm += deltaKm;
          somaLitros += litros;
        }
      }

      if (somaLitros > 0 && somaKm > 0) {
        const media = Number((somaKm / somaLitros).toFixed(1));
        const placa = ordenados[0].veiculo_placa ?? 'Veículo';
        const belowTarget = media < 8.5;
        const pct = Math.min(Math.round((media / 15) * 100), 100);
        listaConsumo.push({
          placa,
          consumoNum: media,
          value: media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          width: `${pct}%`,
          belowTarget,
        });
      }
    });

    return listaConsumo;
  }, [abastecimentos]);

  // Distribuição de custo por tipo de frota (100% dinâmico do banco)
  const distribuicaoPorFrota = useMemo(() => {
    const totalGeral = abastecimentos.reduce((acc, a) => acc + Number(a.valor_total), 0);
    const gastoAdm = abastecimentos
      .filter((a) => a.veiculo_tipo_frota === 'ADMINISTRATIVA')
      .reduce((acc, a) => acc + Number(a.valor_total), 0);
    const gastoSvo = abastecimentos
      .filter((a) => a.veiculo_tipo_frota === 'SVO')
      .reduce((acc, a) => acc + Number(a.valor_total), 0);

    const shareAdm = totalGeral > 0 ? Math.round((gastoAdm / totalGeral) * 100) : 0;
    const shareSvo = totalGeral > 0 ? Math.round((gastoSvo / totalGeral) * 100) : 0;

    return [
      {
        label: 'Frota Administrativa',
        value: gastoAdm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        share: `${shareAdm}%`,
        dotClass: 'bg-[#2D5F9F]',
      },
      {
        label: 'Frota SVO (Operacional)',
        value: gastoSvo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        share: `${shareSvo}%`,
        dotClass: 'bg-[#7597C1]',
      },
    ];
  }, [abastecimentos]);

  // KPIs do topo calculados dinamicamente dos registros da API
  const kpis = useMemo(() => {
    const totalGasto = abastecimentos.reduce((acc, a) => acc + Number(a.valor_total), 0);
    const volumeTotal = abastecimentos.reduce((acc, a) => acc + Number(a.litros), 0);

    const temConsumo = consumoPorVeiculo.length > 0;
    const mediaFrota = temConsumo
      ? (
          consumoPorVeiculo.reduce((acc, c) => acc + c.consumoNum, 0) / consumoPorVeiculo.length
        ).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km/L'
      : '—';

    return {
      gastoTotal: totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      volumeTotal: `${volumeTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`,
      registrosTotal: `${abastecimentos.length} registro${abastecimentos.length === 1 ? '' : 's'}`,
      mediaFrota,
      subtituloMedia: temConsumo ? 'Meta: > 8.5 km/L' : 'Requer 2+ registros por veículo',
    };
  }, [abastecimentos, consumoPorVeiculo]);

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

  const handleSalvarAbastecimento = async (novo: NovoAbastecimentoInput) => {
    try {
      const criado = await abastecimentosApi.criar({
        veiculo_id: novo.veiculo_id,
        motorista_id: novo.motorista_id,
        data_abastecimento: novo.data_abastecimento,
        quilometragem: novo.quilometragem,
        litros: novo.litros,
        valor_total: novo.valor_total,
        posto_combustivel: novo.posto_combustivel || 'Posto Credenciado',
      });
      exibirFeedback(
        `Abastecimento ABS-${String(criado.id).padStart(4, '0')} registrado com sucesso!`,
      );
      carregarDados();
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
      {avisoMotoristas && <Alert tone="warning">{avisoMotoristas}</Alert>}

      {/* 4 Cards de Métricas Operacionais (100% integrados à API) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          label="Gasto Acumulado"
          value={kpis.gastoTotal}
          tone="neutral"
          subtitle={kpis.registrosTotal}
          className="px-5 py-4"
        />
        <MetricCard
          label="Volume Total"
          value={kpis.volumeTotal}
          tone="neutral"
          subtitle="Diesel / Gasolina"
          className="px-5 py-4"
        />
        <MetricCard
          label="Média da Frota"
          value={kpis.mediaFrota}
          tone={consumoPorVeiculo.length > 0 ? 'success' : 'neutral'}
          subtitle={kpis.subtituloMedia}
          className="px-5 py-4"
        />
        <MetricCard
          label="Registros Cadastrados"
          value={abastecimentos.length}
          tone="info"
          subtitle="Histórico oficial"
          className="px-5 py-4"
        />
      </div>

      {/* Grid Principal: Tabela (2 colunas) e Painéis Laterais (1 coluna) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {/* Coluna 1 e 2: Tabela Principal */}
        <Card className="lg:col-span-2">
          <TableToolbar
            title="Registros de Abastecimentos"
            subtitle={
              carregando
                ? 'Carregando dados...'
                : `${abastecimentosFiltrados.length} abastecimento${abastecimentosFiltrados.length === 1 ? '' : 's'}`
            }
            newLabel="Novo Abastecimento"
            onNew={() => setModalAberto(true)}
            onFilter={() => setFiltrosAbertosMobile((f) => !f)}
            isFilterActive={Boolean(busca) || filtrosAbertosMobile}
          />

          <TableFilterCollapse isOpen={filtrosAbertosMobile}>
            <SearchInput
              value={busca}
              onChange={setBusca}
              placeholder="Buscar por placa, motorista ou posto..."
            />
            {busca && (
              <Button variant="ghost" size="sm" onClick={() => setBusca('')}>
                Limpar
              </Button>
            )}
          </TableFilterCollapse>

          <Table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Data</th>
                <th>Veículo</th>
                <th>Condutor</th>
                <th>Volume (L)</th>
                <th>Valor Total</th>
                <th>Posto</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={7} className="p-9 text-center text-slate-500">
                    Carregando registros da API...
                  </td>
                </tr>
              ) : erroCarga ? (
                <tr>
                  <td colSpan={7} className="p-9 text-center text-rose-600">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="font-medium">Falha na comunicação com o servidor: {erroCarga}</p>
                      <Button variant="outline" size="sm" onClick={carregarDados}>
                        Tentar novamente
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : abastecimentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-9 text-center text-slate-500">
                    Nenhum abastecimento encontrado.
                  </td>
                </tr>
              ) : (
                abastecimentosFiltrados.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <IdBadge id={`ABS-${String(a.id).padStart(4, '0')}`} />
                    </td>
                    <td>
                      <span className="text-[13px] text-slate-500">
                        {new Date(a.data_abastecimento).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td>
                      <div>
                        <div className="font-semibold text-slate-900">{a.veiculo_placa ?? 'N/D'}</div>
                        <div className="text-[11px] text-slate-500">{a.veiculo_modelo ?? ''}</div>
                      </div>
                    </td>
                    <td>
                      <span className="text-[13px] text-slate-700">{a.motorista_nome ?? 'N/D'}</span>
                    </td>
                    <td>
                      <span className="font-medium text-slate-800">
                        {Number(a.litros).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
                      </span>
                    </td>
                    <td>
                      <span className="font-semibold text-slate-900">
                        {Number(a.valor_total).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-500">{a.posto_combustivel ?? '—'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>

          <Pagination
            showing={`1–${abastecimentosFiltrados.length}`}
            total={abastecimentosFiltrados.length}
          />
        </Card>

        {/* Coluna 3: Painéis Analíticos Auxiliares (100% baseados na API REST) */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="border-b border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Eficiência por Veículo</h3>
              <p className="mt-0.5 text-xs text-slate-500">Média calculada de consumo (km/L)</p>
            </div>
            <div className="flex flex-col gap-3 p-4">
              {consumoPorVeiculo.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">
                  Requer pelo menos 2 abastecimentos registrados por veículo para o cálculo de km/L.
                </p>
              ) : (
                consumoPorVeiculo.slice(0, 6).map((item) => (
                  <div key={item.placa} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-800">{item.placa}</span>
                      <span
                        className={cn(
                          'font-semibold',
                          item.belowTarget ? 'text-rose-600' : 'text-emerald-600',
                        )}
                      >
                        {item.value} km/L
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          item.belowTarget ? 'bg-rose-500' : 'bg-emerald-500',
                        )}
                        style={{ width: item.width }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Distribuição por Frota</h3>
              <p className="mt-0.5 text-xs text-slate-500">Consumo segmentado de combustível</p>
            </div>
            <div className="flex flex-col gap-3 p-4">
              {distribuicaoPorFrota.map((cat) => (
                <div key={cat.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', cat.dotClass)} />
                    <span className="text-slate-700">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <span>{cat.value}</span>
                    <Badge tone="neutral">
                      {cat.share}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal de Novo Abastecimento */}
      {modalAberto && (
        <ModalAbastecimento
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvarAbastecimento}
        />
      )}
    </div>
  );
}
