import { useState, useMemo } from 'react';
import {
  Badge,
  Card,
  IdBadge,
  Table,
  TableToolbar,
  Pagination,
} from '../components/ui';
import type { Abastecimento, NovoAbastecimentoInput } from '../types/abastecimento';
import { storageService } from '../services/storageService';
import { ModalAbastecimento } from './abastecimento/ModalAbastecimento';

export default function AbastecimentoPage() {
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>(
    storageService.getAbastecimentos()
  );
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState('');
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
      valorPendentes: valorPendentes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
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
        value: consumo.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
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
        String(a.id).includes(term)
    );
  }, [abastecimentos, busca]);

  const handleSalvarAbastecimento = (novo: NovoAbastecimentoInput) => {
    try {
      const criado = storageService.createAbastecimento(novo);
      setAbastecimentos(storageService.getAbastecimentos());
      exibirFeedback(
        `Abastecimento ABS-${String(criado.id).padStart(4, '0')} registrado com sucesso!`
      );
    } catch (error: any) {
      exibirFeedback(error.message || 'Erro ao registrar abastecimento.', true);
    }
  };

  const handleExcluir = (id: number) => {
    if (window.confirm(`Tem certeza que deseja excluir o abastecimento ABS-${String(id).padStart(4, '0')}?`)) {
      try {
        storageService.deleteAbastecimento(id);
        setAbastecimentos(storageService.getAbastecimentos());
        exibirFeedback('Abastecimento removido com sucesso.');
      } catch (error: any) {
        exibirFeedback(error.message || 'Erro ao excluir abastecimento.', true);
      }
    }
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Feedback de sucesso e erro */}
      {(mensagemSucesso || mensagemErro) && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            border: `1px solid ${mensagemErro ? 'var(--color-danger)' : 'var(--color-success)'}`,
            color: mensagemErro ? 'var(--color-danger)' : 'var(--color-success)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span>{mensagemErro ? '❌' : '✅'} {mensagemErro || mensagemSucesso}</span>
        </div>
      )}

      {/* ── 4 Top KPI Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: Gasto no mês */}
        <Card style={{ padding: '20px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-display)',
              marginBottom: '8px',
            }}
          >
            Gasto no mês
          </div>
          <div
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.02em',
            }}
          >
            {kpis.gastoMes}
          </div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--color-text-subtle)' }}>
            Total consolidado
          </div>
        </Card>

        {/* Card 2: Volume no mês */}
        <Card style={{ padding: '20px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-display)',
              marginBottom: '8px',
            }}
          >
            Volume no mês
          </div>
          <div
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.02em',
            }}
          >
            {kpis.volumeMes}
          </div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--color-text-subtle)' }}>
            {kpis.registrosTotal}
          </div>
        </Card>

        {/* Card 3: Média da frota */}
        <Card style={{ padding: '20px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-display)',
              marginBottom: '8px',
            }}
          >
            Média da frota
          </div>
          <div
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.02em',
            }}
          >
            {kpis.mediaFrota}
          </div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--color-text-subtle)' }}>
            Meta mensal: 8,5 km/L
          </div>
        </Card>

        {/* Card 4: Pendentes */}
        <Card style={{ padding: '20px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-display)',
              marginBottom: '8px',
            }}
          >
            Pendentes
          </div>
          <div
            style={{
              fontSize: '26px',
              fontWeight: 700,
              color: 'var(--color-warning)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.02em',
            }}
          >
            {kpis.qtdPendentes}
          </div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--color-warning)' }}>
            {kpis.valorPendentes} para validar
          </div>
        </Card>
      </div>

      {/* ── Gráficos Analíticos (Widgets Intermediários) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Widget 1: Consumo por Veículo */}
        <Card style={{ padding: '24px', gridColumn: 'span 2' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                Consumo por veículo
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--color-text-muted)' }}>
                Média registrada no mês, em km/L
              </div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-neutral)' }}>
              Outubro de 2026
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px 28px',
            }}
          >
            {consumoPorVeiculo.map((item) => (
              <div key={item.placa}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-text-strong)',
                    }}
                  >
                    {item.placa}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: item.belowTarget ? 'var(--color-warning)' : 'var(--color-neutral)',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {item.value} km/L
                  </span>
                </div>
                <div
                  style={{
                    height: '6px',
                    borderRadius: 'var(--radius-full)',
                    overflow: 'hidden',
                    background: '#E9EEF4',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 'var(--radius-full)',
                      width: item.width,
                      background: item.belowTarget ? '#C58A42' : 'var(--color-primary)',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Widget 2: Distribuição de Custos */}
        <Card style={{ padding: '24px' }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Distribuição de custos
          </div>
          <div style={{ fontSize: '12px', marginTop: '4px', marginBottom: '20px', color: 'var(--color-text-muted)' }}>
            Participação por categoria
          </div>

          {/* Barra segmentada */}
          <div
            style={{
              height: '12px',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
              display: 'flex',
              marginBottom: '20px',
              background: '#EEF2F6',
            }}
          >
            <div style={{ width: '58%', background: '#2D5F9F' }} />
            <div style={{ width: '32%', background: '#7597C1' }} />
            <div style={{ width: '10%', background: '#BCC9D8' }} />
          </div>

          {/* Legenda de categorias */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'Caminhões', value: 'R$ 10.689', share: '58%', color: '#2D5F9F' },
              { label: 'Vans', value: 'R$ 5.898', share: '32%', color: '#7597C1' },
              { label: 'Utilitários', value: 'R$ 1.843', share: '10%', color: '#BCC9D8' },
            ].map((cat) => (
              <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: cat.color,
                  }}
                />
                <span style={{ fontSize: '13px', flex: 1, color: 'var(--color-text-secondary)' }}>
                  {cat.label}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                  {cat.value}
                </span>
                <span style={{ fontSize: '12px', width: '32px', textAlign: 'right', color: 'var(--color-text-subtle)' }}>
                  {cat.share}
                </span>
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
          newLabel="Registrar"
          onNew={() => setModalAberto(true)}
        />

        {/* Campo de busca e filtro rápido */}
        <div style={{ padding: '0 24px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Buscar por placa, motorista ou posto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              fontSize: '13px',
              maxWidth: '360px',
              width: '100%',
              outline: 'none',
            }}
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Limpar busca
            </button>
          )}
        </div>

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
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {abastecimentosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
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
                      <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {a.data_abastecimento.includes('-')
                          ? a.data_abastecimento.split('-').reverse().join('/')
                          : a.data_abastecimento}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-strong)' }}>
                          {a.veiculo_placa ?? 'N/D'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                          {a.quilometragem.toLocaleString('pt-BR')} km
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                          {a.motorista_nome ?? 'N/D'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
                          {a.posto_combustivel ?? 'Posto não informado'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        {Number(a.litros).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} L
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        {Number(a.valor_litro ?? (a.valor_total / (a.litros || 1))).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'var(--color-text)',
                          fontFamily: 'var(--font-display)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {Number(a.valor_total).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          color: abaixoMeta ? 'var(--color-warning)' : 'var(--color-success)',
                        }}
                      >
                        {consumoVal.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/L
                      </span>
                    </td>
                    <td>
                      <Badge tone={a.status === 'CONFIRMADO' ? 'success' : 'warning'}>
                        {a.status === 'CONFIRMADO' ? 'Validado' : 'Pendente'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleExcluir(a.id)}
                        title="Excluir abastecimento"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-danger)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-danger-soft)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${abastecimentosFiltrados.length}`} total={abastecimentosFiltrados.length} />
      </Card>

      {/* Modal de Cadastro */}
      {modalAberto && (
        <ModalAbastecimento
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvarAbastecimento}
        />
      )}
    </div>
  );
}
