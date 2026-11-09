import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Fuel,
  Gauge,
  History,
  Pencil,
  Users,
} from 'lucide-react';
import { Badge, Button, Drawer, PlacaMercosul, type BadgeTone } from '../../components/ui';
import type { Veiculo } from '../../types/veiculo';
import type { Manutencao } from '../../types/manutencao';
import type { Abastecimento } from '../../types/abastecimento';
import type { Multa } from '../../types/multa';
import { manutencoesApi } from '../../services/api/manutencoesApi';
import { abastecimentosApi } from '../../services/api/abastecimentosApi';
import { multasApi } from '../../services/api/multasApi';
import { cn } from '../../utils/cn';

interface DrawerDetalhesVeiculoProps {
  veiculo: Veiculo | null;
  onClose: () => void;
  onAbrirManutencoes?: (veiculo: Veiculo) => void;
  onNovoAbastecimento?: (veiculo: Veiculo) => void;
  onNovaMulta?: (veiculo: Veiculo) => void;
  onEditar?: (veiculo: Veiculo) => void;
}

function obterBadgeToneStatus(status: string): BadgeTone {
  switch (status) {
    case 'DISPONIVEL':
      return 'success';
    case 'MANUTENCAO':
      return 'danger';
    case 'EM_VIAGEM':
    case 'ALOCADO':
      return 'info';
    case 'INATIVO':
    default:
      return 'neutral';
  }
}

export function DrawerDetalhesVeiculo({
  veiculo,
  onClose,
  onNovoAbastecimento,
  onNovaMulta,
  onEditar,
}: DrawerDetalhesVeiculoProps) {
  const navigate = useNavigate();
  // Retém o último estado do veículo para saída suave no fechamento (350ms)
  const [veiculoState, setVeiculoState] = useState<Veiculo | null>(veiculo);

  useEffect(() => {
    if (veiculo) {
      setVeiculoState(veiculo);
    }
  }, [veiculo]);

  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [multas, setMultas] = useState<Multa[]>([]);

  useEffect(() => {
    if (!veiculoState) return;
    let ativo = true;
    Promise.all([
      manutencoesApi.listarPorVeiculo(veiculoState.id).catch(() => []),
      abastecimentosApi.listarPorVeiculo(veiculoState.id).catch(() => []),
      multasApi.listar().catch(() => []),
    ]).then(([mList, aList, muList]) => {
      if (!ativo) return;
      setManutencoes(mList);
      setAbastecimentos(aList);
      setMultas(muList.filter((m) => m.veiculo_id === veiculoState.id));
    });
    return () => {
      ativo = false;
    };
  }, [veiculoState]);

  const dadosVeiculo = useMemo(() => {
    if (!veiculoState) return null;

    const totalGastoManutencao = manutencoes.reduce((acc, m) => acc + Number(m.custo || 0), 0);
    const totalGastoCombustivel = abastecimentos.reduce(
      (acc, a) => acc + Number(a.valor_total || 0),
      0,
    );
    const ultimasManutencoes = [...manutencoes].slice(-3).reverse();
    const ultimosAbastecimentos = [...abastecimentos].slice(-3).reverse();
    const multasPendentes = multas.filter((m) => m.status_pagamento === 'PENDENTE');

    return {
      manutencoes,
      abastecimentos,
      multas,
      multasPendentes,
      totalGastoManutencao,
      totalGastoCombustivel,
      ultimasManutencoes,
      ultimosAbastecimentos,
    };
  }, [veiculoState, manutencoes, abastecimentos, multas]);

  if (!veiculoState) return null;

  return (
    <Drawer
      isOpen={Boolean(veiculo)}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <PlacaMercosul placa={veiculoState.placa} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 truncate">
                {veiculoState.modelo}
              </h2>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                  veiculoState.tipo_frota === 'SVO'
                    ? 'bg-purple-bg text-purple'
                    : 'bg-blue-50 text-blue-700',
                )}
              >
                Frota {veiculoState.tipo_frota}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <span>Status:</span>
              <Badge tone={obterBadgeToneStatus(veiculoState.status)}>
                {veiculoState.status === 'DISPONIVEL'
                  ? 'Disponível'
                  : veiculoState.status === 'MANUTENCAO'
                    ? 'Em Manutenção'
                    : veiculoState.status}
              </Badge>
            </div>
          </div>
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {onEditar ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onEditar(veiculoState);
              }}
            >
              <Pencil size={13} className="mr-1" /> Editar Veículo
            </Button>
          ) : (
            <div />
          )}

          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* 1. Barra de Ações Rápidas (Acesso Direto FMS) */}
        <div>
          <div className="mb-2.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Ações Rápidas do Veículo
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Button
              variant="outline"
              size="sm"
              className="justify-center"
              onClick={() => {
                onClose();
                onNovoAbastecimento?.(veiculoState);
              }}
            >
              <Fuel size={14} className="mr-1.5 text-primary" /> Registrar Abastecimento
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="justify-center"
              onClick={() => {
                onClose();
                onNovaMulta?.(veiculoState);
              }}
            >
              <AlertTriangle size={14} className="mr-1.5 text-danger" /> Registrar Multa
            </Button>
          </div>
        </div>

        {/* 2. Cartões de Resumo Técnico & Quilometragem */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-surface-alt p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Gauge size={14} className="text-primary" />
              <span>Quilometragem Atual</span>
            </div>
            <div className="mt-1 font-display text-lg font-bold text-slate-900">
              {veiculoState.km_atual?.toLocaleString('pt-BR') ?? '0'}{' '}
              <span className="text-xs font-normal text-slate-500">km</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-alt p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Users size={14} className="text-primary" />
              <span>Capacidade Máxima</span>
            </div>
            <div className="mt-1 font-display text-lg font-bold text-slate-900">
              {veiculoState.capacidade_maxima ?? '—'}{' '}
              <span className="text-xs font-normal text-slate-500">ocupantes</span>
            </div>
          </div>
        </div>

        {/* 3. Indicadores de Custo Acumulado */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
          <div className="mb-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Investimento no Veículo
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-text-muted">Gasto em Manutenção</div>
              <div className="mt-0.5 font-display text-base font-bold text-primary">
                {dadosVeiculo?.totalGastoManutencao.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </div>
              <div className="text-[11px] text-slate-400">
                {dadosVeiculo?.manutencoes.length ?? 0} ordens registradas
              </div>
            </div>

            <div>
              <div className="text-xs text-text-muted">Gasto em Combustível</div>
              <div className="mt-0.5 font-display text-base font-bold text-emerald-700">
                {dadosVeiculo?.totalGastoCombustivel.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </div>
              <div className="text-[11px] text-slate-400">
                {dadosVeiculo?.abastecimentos.length ?? 0} abastecimentos
              </div>
            </div>
          </div>
        </div>

        {/* 4. Histórico Recente de Manutenções */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              <History size={13} /> Últimas Manutenções
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/manutencoes');
              }}
              className="cursor-pointer text-xs font-semibold text-primary hover:underline"
            >
              Ver todas na aba de manutenções ({dadosVeiculo?.manutencoes.length ?? 0})
            </button>
          </div>

          {!dadosVeiculo?.ultimasManutencoes.length ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-muted">
              Nenhuma manutenção registrada para este veículo.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {dadosVeiculo.ultimasManutencoes.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {m.tipo_manutencao === 'PREVENTIVA' ? 'Preventiva' : 'Corretiva'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(m.data_manutencao).toLocaleDateString('pt-BR', {
                          timeZone: 'UTC',
                        })}
                      </span>
                    </div>
                    <div className="truncate text-xs text-slate-600" title={m.descricao}>
                      {m.descricao}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-slate-900">
                      {Number(m.custo).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-semibold',
                        m.status === 'CONCLUIDA'
                          ? 'text-emerald-700'
                          : m.status === 'EM_ANDAMENTO'
                            ? 'text-blue-700'
                            : 'text-amber-700',
                      )}
                    >
                      {m.status === 'CONCLUIDA'
                        ? 'Concluída'
                        : m.status === 'EM_ANDAMENTO'
                          ? 'Em Oficina'
                          : 'Agendada'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5. Alertas & Multas Pendentes (se houver) */}
        {dadosVeiculo && dadosVeiculo.multasPendentes.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
              <AlertTriangle size={15} />
              <span>{dadosVeiculo.multasPendentes.length} Multa(s) Pendente(s)</span>
            </div>
            <p className="mt-1 text-xs text-rose-700">
              Este veículo possui infrações aguardando quitação ou indicação de condutor.
            </p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
