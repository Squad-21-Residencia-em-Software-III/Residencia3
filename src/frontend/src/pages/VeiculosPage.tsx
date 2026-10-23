import { useState, useMemo } from 'react';
import {
  Badge,
  Card,
  IdBadge,
  Table,
  TableToolbar,
  Pagination,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import type { StatusVeiculo, Veiculo } from '../types/veiculo';
import { storageService } from '../services/storageService';
import { ModalVeiculo } from './veiculos/ModalVeiculo';

const STATUS_MAP: Record<StatusVeiculo, { label: string; tone: BadgeTone }> = {
  DISPONIVEL: { label: 'Disponível', tone: 'success' },
  EM_USO: { label: 'Em Uso', tone: 'info' },
  MANUTENCAO: { label: 'Manutenção', tone: 'danger' },
};

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>(storageService.getVeiculos());
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [modalAberto, setModalAberto] = useState(false);
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

  // Métricas do topo
  const totais = useMemo(() => {
    return {
      total: veiculos.length,
      disponiveis: veiculos.filter((v) => v.status === 'DISPONIVEL').length,
      emUso: veiculos.filter((v) => v.status === 'EM_USO').length,
      manutencao: veiculos.filter((v) => v.status === 'MANUTENCAO').length,
    };
  }, [veiculos]);

  // Filtragem
  const veiculosFiltrados = useMemo(() => {
    if (filtroTipo === 'TODOS') return veiculos;
    return veiculos.filter((v) => v.tipo_frota === filtroTipo);
  }, [veiculos, filtroTipo]);

  const handleSalvarVeiculo = (novo: Omit<Veiculo, 'id'>) => {
    try {
      storageService.createVeiculo(novo);
      setVeiculos(storageService.getVeiculos());
      exibirFeedback(`Veículo com placa ${novo.placa} cadastrado com sucesso!`);
    } catch (error: any) {
      exibirFeedback(error.message, true);
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
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mensagemErro ? '❌' : '✅'} {mensagemErro || mensagemSucesso}
          </span>
        </div>
      )}

      {/* ── Cards de Resumo ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        <Card style={{ padding: '16px 20px' }}>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {totais.total}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Total na Frota
          </div>
        </Card>

        <Card style={{ padding: '16px 20px' }}>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--color-success)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {totais.disponiveis}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Disponíveis
          </div>
        </Card>

        <Card style={{ padding: '16px 20px' }}>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--color-primary)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {totais.emUso}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Em Uso
          </div>
        </Card>

        <Card style={{ padding: '16px 20px' }}>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--color-danger)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {totais.manutencao}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Em Manutenção
          </div>
        </Card>
      </div>

      {/* ── Tabela de Veículos ── */}
      <Card>
        <TableToolbar
          title="Frota de Veículos"
          subtitle={`${veiculosFiltrados.length} veículos listados`}
          newLabel="Novo Veículo"
          onNew={() => setModalAberto(true)}
        />

        {/* Barra de Filtros Rápida */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            borderBottom: '1px solid var(--color-divider)',
            background: 'var(--color-surface-alt)',
          }}
        >
          {(['TODOS', 'ADMINISTRATIVA', 'SVO'] as const).map((tipo) => (
            <button
              key={tipo}
              onClick={() => setFiltroTipo(tipo)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                background: filtroTipo === tipo ? 'var(--color-primary)' : 'transparent',
                color: filtroTipo === tipo ? '#fff' : 'var(--color-text-secondary)',
                border: '1px solid',
                borderColor: filtroTipo === tipo ? 'var(--color-primary)' : 'var(--color-border)',
                transition: 'all 0.15s ease',
              }}
            >
              {tipo === 'TODOS' ? 'Todos os Veículos' : tipo === 'SVO' ? 'Frota SVO' : 'Frota Administrativa'}
            </button>
          ))}
        </div>

        <Table>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Modelo</th>
              <th>Tipo de Frota</th>
              <th>Capacidade Máxima</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {veiculosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                  Nenhum veículo encontrado para este filtro.
                </td>
              </tr>
            ) : (
              veiculosFiltrados.map((v) => {
                const statusInfo = STATUS_MAP[v.status] || { label: v.status, tone: 'neutral' };
                return (
                  <tr key={v.id}>
                    <td>
                      <IdBadge id={v.placa} />
                    </td>
                    <td>
                      <strong style={{ color: 'var(--color-text-strong)', fontWeight: 600 }}>
                        {v.modelo}
                      </strong>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: v.tipo_frota === 'SVO' ? 'var(--color-purple-bg)' : 'var(--color-neutral-bg)',
                          color: v.tipo_frota === 'SVO' ? 'var(--color-purple)' : 'var(--color-text-strong)',
                        }}
                      >
                        {v.tipo_frota}
                      </span>
                    </td>
                    <td>{v.capacidade_maxima}</td>
                    <td>
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${veiculosFiltrados.length}`} total={veiculosFiltrados.length} />
      </Card>

      {/* ── Modal de Cadastro ── */}
      {modalAberto && (
        <ModalVeiculo
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvarVeiculo}
        />
      )}
    </div>
  );
}
