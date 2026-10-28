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
import { ModalManutencoesVeiculo } from './veiculos/ModalManutencoesVeiculo';

const STATUS_MAP: Record<StatusVeiculo, { label: string; tone: BadgeTone }> = {
  DISPONIVEL: { label: 'Disponível', tone: 'success' },
  EM_USO: { label: 'Em Uso', tone: 'info' },
  MANUTENCAO: { label: 'Manutenção', tone: 'danger' },
  RESERVADO: { label: 'Reservado', tone: 'warning' },
};

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>(storageService.getVeiculos());
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [modalAberto, setModalAberto] = useState(false);
  const [veiculoManutencao, setVeiculoManutencao] = useState<Veiculo | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const handleManutencaoSalva = (msg: string) => {
    setVeiculos(storageService.getVeiculos());
    exibirFeedback(msg);
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
      emUso: veiculos.filter((v) => v.status === 'EM_USO').length,
      manutencao: veiculos.filter((v) => v.status === 'MANUTENCAO').length,
    };
  }, [veiculos]);

  // Filtragem combinada por Tipo de Frota e Status
  const veiculosFiltrados = useMemo(() => {
    return veiculos.filter((v) => {
      const bateTipo = filtroTipo === 'TODOS' || v.tipo_frota === filtroTipo;
      const bateStatus = filtroStatus === 'TODOS' || v.status === filtroStatus;
      return bateTipo && bateStatus;
    });
  }, [veiculos, filtroTipo, filtroStatus]);

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
      {/* ── Cards de Resumo (Clicáveis como Filtros Rápidos) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        <Card
          onClick={() => setFiltroStatus('TODOS')}
          style={{
            padding: '16px 20px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border:
              filtroStatus === 'TODOS'
                ? '2px solid var(--color-primary)'
                : '1px solid var(--color-border)',
            boxShadow: filtroStatus === 'TODOS' ? 'var(--shadow-sm)' : undefined,
          }}
        >
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
            Total na Frota {filtroStatus === 'TODOS' ? '• Ativo' : ''}
          </div>
        </Card>

        <Card
          onClick={() => setFiltroStatus(filtroStatus === 'DISPONIVEL' ? 'TODOS' : 'DISPONIVEL')}
          style={{
            padding: '16px 20px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border:
              filtroStatus === 'DISPONIVEL'
                ? '2px solid var(--color-success)'
                : '1px solid var(--color-border)',
            boxShadow: filtroStatus === 'DISPONIVEL' ? 'var(--shadow-sm)' : undefined,
          }}
        >
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
            Disponíveis {filtroStatus === 'DISPONIVEL' ? '• Ativo' : ''}
          </div>
        </Card>

        <Card
          onClick={() => setFiltroStatus(filtroStatus === 'EM_USO' ? 'TODOS' : 'EM_USO')}
          style={{
            padding: '16px 20px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border:
              filtroStatus === 'EM_USO'
                ? '2px solid var(--color-primary)'
                : '1px solid var(--color-border)',
            boxShadow: filtroStatus === 'EM_USO' ? 'var(--shadow-sm)' : undefined,
          }}
        >
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
            Em Uso {filtroStatus === 'EM_USO' ? '• Ativo' : ''}
          </div>
        </Card>

        <Card
          onClick={() => setFiltroStatus(filtroStatus === 'MANUTENCAO' ? 'TODOS' : 'MANUTENCAO')}
          style={{
            padding: '16px 20px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border:
              filtroStatus === 'MANUTENCAO'
                ? '2px solid var(--color-danger)'
                : '1px solid var(--color-border)',
            boxShadow: filtroStatus === 'MANUTENCAO' ? 'var(--shadow-sm)' : undefined,
          }}
        >
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
            Em Manutenção {filtroStatus === 'MANUTENCAO' ? '• Ativo' : ''}
          </div>
        </Card>
      </div>

      {/* ── Tabela de Veículos ── */}
      <Card>
        <TableToolbar
          title="Frota de Veículos"
          subtitle={`${veiculosFiltrados.length} de ${veiculos.length} veículos listados`}
          newLabel="Novo Veículo"
          onNew={() => setModalAberto(true)}
        />

        {/* Barra de Filtros: Tipo de Frota + Status do Veículo */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '12px 24px',
            borderBottom: '1px solid var(--color-divider)',
            background: 'var(--color-surface-alt)',
          }}
        >
          {/* Grupo 1: Tipo de Frota */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              Frota:
            </span>
            {(['TODOS', 'ADMINISTRATIVA', 'SVO'] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setFiltroTipo(tipo)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: filtroTipo === tipo ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: filtroTipo === tipo ? '#fff' : 'var(--color-text-secondary)',
                  border: '1px solid',
                  borderColor: filtroTipo === tipo ? 'var(--color-primary)' : 'var(--color-border)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tipo === 'TODOS' ? 'Todas' : tipo === 'SVO' ? 'SVO' : 'Administrativa'}
              </button>
            ))}
          </div>

          {/* Grupo 2: Status do Veículo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              Status:
            </span>
            {[
              { id: 'TODOS', label: 'Todos' },
              { id: 'DISPONIVEL', label: 'Disponível', cor: 'var(--color-success)' },
              { id: 'EM_USO', label: 'Em Uso', cor: 'var(--color-primary)' },
	      { id: 'RESERVADO', label: 'Reservado', cor: 'var(--color-warning)' },
              { id: 'MANUTENCAO', label: 'Manutenção', cor: 'var(--color-danger)' },
            ].map((st) => {
              const ativo = filtroStatus === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setFiltroStatus(st.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: ativo ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: ativo ? '#fff' : 'var(--color-text-secondary)',
                    border: '1px solid',
                    borderColor: ativo ? 'var(--color-primary)' : 'var(--color-border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {st.cor && (
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: ativo ? '#fff' : st.cor,
                      }}
                    />
                  )}
                  {st.label}
                </button>
              );
            })}

            {/* Botão Limpar Filtros quando algum filtro estiver ativo */}
            {(filtroTipo !== 'TODOS' || filtroStatus !== 'TODOS') && (
              <button
                type="button"
                onClick={() => {
                  setFiltroTipo('TODOS');
                  setFiltroStatus('TODOS');
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <th>Placa</th>
              <th>Modelo</th>
              <th>Tipo de Frota</th>
              <th>Capacidade Máxima</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {veiculosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
                  <div>Nenhum veículo encontrado com os filtros selecionados.</div>
                  {(filtroTipo !== 'TODOS' || filtroStatus !== 'TODOS') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFiltroTipo('TODOS');
                        setFiltroStatus('TODOS');
                      }}
                      style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Remover filtros
                    </button>
                  )}
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
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setVeiculoManutencao(v)}
                        title={`Histórico e registro de manutenções de ${v.modelo}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--color-primary)',
                          background: 'var(--color-surface-alt)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-surface-hover)';
                          e.currentTarget.style.borderColor = 'var(--color-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--color-surface-alt)';
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                        }}
                      >
                        <span>🔧</span> Manutenções
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <Pagination showing={`1–${veiculosFiltrados.length}`} total={veiculosFiltrados.length} />
      </Card>

      {/* ── Modal de Cadastro de Veículo ── */}
      {modalAberto && (
        <ModalVeiculo
          onClose={() => setModalAberto(false)}
          onSalvar={handleSalvarVeiculo}
        />
      )}

      {/* ── Modal de Histórico e Registro de Manutenções ── */}
      {veiculoManutencao && (
        <ModalManutencoesVeiculo
          veiculo={veiculoManutencao}
          onClose={() => setVeiculoManutencao(null)}
          onManutencaoSalva={handleManutencaoSalva}
        />
      )}
    </div>
  );
}
