import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  FilterSelect,
  IdBadge,
  MetricCard,
  Pagination,
  SearchInput,
  Table,
  TableFilterCollapse,
  TableToolbar,
} from '../components/ui';
import type { BadgeTone, MetricTone } from '../components/ui';
import type { Motorista, StatusMotorista, TipoMotorista } from '../types/motorista';
import { mensagemDeErro } from '../services/api/http';
import { motoristasApi } from '../services/api/motoristasApi';

type FiltroTipo = 'TODOS' | TipoMotorista;
type FiltroStatus = 'TODOS' | StatusMotorista;

// Status é definido pelo backend (sincronização com viagens); a tela apenas exibe.
const STATUS_MAP: Record<
  StatusMotorista,
  { label: string; tone: BadgeTone; metricTone: MetricTone; activeClass: string }
> = {
  DISPONIVEL: {
    label: 'Disponível',
    tone: 'success',
    metricTone: 'success',
    activeClass: 'border-emerald-600 bg-emerald-600 text-white',
  },
  DESIGNADO: {
    label: 'Designado',
    tone: 'warning',
    metricTone: 'warning',
    activeClass: 'border-amber-600 bg-amber-600 text-white',
  },
  EM_VIAGEM: {
    label: 'Em Viagem',
    tone: 'info',
    metricTone: 'primary',
    activeClass: 'border-primary bg-primary text-white',
  },
  AFASTADO: {
    label: 'Afastado',
    tone: 'danger',
    metricTone: 'danger',
    activeClass: 'border-rose-600 bg-rose-600 text-white',
  },
  INATIVO: {
    label: 'Inativo',
    tone: 'neutral',
    metricTone: 'neutral',
    activeClass: 'border-slate-500 bg-slate-500 text-white',
  },
};

function cnhVencida(validade: string) {
  return validade < new Date().toISOString().slice(0, 10);
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function MotoristasPage() {
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS');
  const [busca, setBusca] = useState('');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);

  useEffect(() => {
    motoristasApi
      .listar()
      .then(setMotoristas)
      .catch((error) => setErroCarga(mensagemDeErro(error)))
      .finally(() => setCarregando(false));
  }, []);

  const totais = useMemo(
    () => ({
      total: motoristas.length,
      disponiveis: motoristas.filter((m) => m.status === 'DISPONIVEL').length,
      designados: motoristas.filter((m) => m.status === 'DESIGNADO').length,
      emViagem: motoristas.filter((m) => m.status === 'EM_VIAGEM').length,
      vencidas: motoristas.filter((m) => cnhVencida(m.validade_cnh)).length,
    }),
    [motoristas],
  );

  const filtrados = useMemo(
    () =>
      motoristas.filter((m) => {
        const bateTipo = filtroTipo === 'TODOS' || m.tipo_motorista === filtroTipo;
        const bateStatus = filtroStatus === 'TODOS' || m.status === filtroStatus;
        if (!bateTipo || !bateStatus) return false;
        if (busca.trim()) {
          const termo = busca.trim().toLowerCase();
          const matchNome = m.nome.toLowerCase().includes(termo);
          const matchCnh = (m.numero_cnh ?? '').toLowerCase().includes(termo);
          if (!matchNome && !matchCnh) return false;
        }
        return true;
      }),
    [motoristas, filtroTipo, filtroStatus, busca],
  );

  const alternarStatus = (status: StatusMotorista) =>
    setFiltroStatus(filtroStatus === status ? 'TODOS' : status);

  return (
    <div className="grid gap-6">
      {/* ── Cards de Resumo (Clicáveis como Filtros Rápidos) ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <MetricCard
          label="Total de Motoristas"
          value={totais.total}
          tone="neutral"
          className="px-5 py-4"
        />
        <MetricCard
          label="Disponíveis"
          value={totais.disponiveis}
          tone="success"
          isActive={filtroStatus === 'DISPONIVEL'}
          onClick={() => alternarStatus('DISPONIVEL')}
          className="px-5 py-4"
        />
        <MetricCard
          label="Designados"
          value={totais.designados}
          tone="warning"
          isActive={filtroStatus === 'DESIGNADO'}
          onClick={() => alternarStatus('DESIGNADO')}
          className="px-5 py-4"
        />
        <MetricCard
          label="Em Viagem"
          value={totais.emViagem}
          tone="primary"
          isActive={filtroStatus === 'EM_VIAGEM'}
          onClick={() => alternarStatus('EM_VIAGEM')}
          className="px-5 py-4"
        />
        <MetricCard
          label="CNH Vencida"
          value={totais.vencidas}
          tone="danger"
          className="col-span-2 px-5 py-4 lg:col-span-1"
        />
      </div>

      <Card>
        <TableToolbar
          title="Motoristas"
          subtitle={`${filtrados.length} de ${motoristas.length} motoristas listados`}
          onFilter={() => setFiltrosAbertosMobile((f) => !f)}
          isFilterActive={
            filtroTipo !== 'TODOS' ||
            filtroStatus !== 'TODOS' ||
            Boolean(busca) ||
            filtrosAbertosMobile
          }
        />

        {/* Barra de Filtros: Busca + Tipo + Status */}
        <TableFilterCollapse isOpen={filtrosAbertosMobile}>
          {/* Busca textual na esquerda */}
          <SearchInput
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por nome ou CNH..."
          />

          {/* Filtros em dropdown na sequência */}
          <FilterSelect
            aria-label="Filtrar por tipo de motorista"
            value={filtroTipo}
            onChange={(val) => setFiltroTipo(val as FiltroTipo)}
            options={[
              { value: 'TODOS', label: 'Todos os tipos' },
              { value: 'FROTA', label: 'Motoristas Frota' },
              { value: 'SVO', label: 'Motoristas SVO' },
            ]}
          />

          <FilterSelect
            aria-label="Filtrar por status do motorista"
            value={filtroStatus}
            onChange={(val) => setFiltroStatus(val as FiltroStatus)}
            options={[
              { value: 'TODOS', label: 'Todos os status' },
              { value: 'DISPONIVEL', label: 'Disponível' },
              { value: 'DESIGNADO', label: 'Designado' },
              { value: 'EM_VIAGEM', label: 'Em Viagem' },
              { value: 'AFASTADO', label: 'Afastado' },
              { value: 'INATIVO', label: 'Inativo' },
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
              <th>Motorista</th>
              <th>Número da CNH</th>
              <th>Categoria</th>
              <th>Validade da CNH</th>
              <th>Tipo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  {carregando ? 'Carregando motoristas...' : erroCarga ?? 'Nenhum motorista encontrado para este filtro.'}
                </td>
              </tr>
            ) : (
              filtrados.map((m) => {
                const statusInfo = STATUS_MAP[m.status] ?? { label: m.status, tone: 'neutral' as BadgeTone };
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={m.nome} />
                        <strong className="font-semibold text-slate-900">{m.nome}</strong>
                      </span>
                    </td>
                    <td>
                      <IdBadge id={m.numero_cnh} />
                    </td>
                    <td>{m.categoria_cnh}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        {formatarData(m.validade_cnh)}
                        {cnhVencida(m.validade_cnh) && <Badge tone="danger">Vencida</Badge>}
                      </span>
                    </td>
                    <td>
                      <Badge tone={m.tipo_motorista === 'SVO' ? 'purple' : 'neutral'}>{m.tipo_motorista}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${filtrados.length}`} total={filtrados.length} />
      </Card>
    </div>
  );
}
