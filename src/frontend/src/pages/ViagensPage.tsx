import { Fragment, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Flag,
  MapPin,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  IdBadge,
  Pagination,
  Table,
  TableToolbar,
  type BadgeTone,
} from '../components/ui';
import { storageService } from '../services/storageService';
import {
  LABELS_STATUS_VIAGEM,
  type StatusViagem,
  type Viagem,
} from '../types/viagem';
import { ModalDetalhesViagem } from './viagens/ModalDetalhesViagem';
import { ModalFinalizarViagem } from './viagens/ModalFinalizarViagem';
import { ModalNovaViagem } from './viagens/ModalNovaViagem';
import { TicketViagem } from './viagens/TicketViagem';

type FiltroAba = 'TODAS' | 'EM_ANDAMENTO' | 'AGENDADAS' | 'CONCLUIDAS' | 'FROTA' | 'SVO';

const cardValor = (cor: string) => ({
  fontSize: '24px',
  fontWeight: 800,
  color: cor,
  fontFamily: 'var(--font-display)',
});
const cardRotulo = { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' };

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

export default function ViagensPage() {
  const [viagens, setViagens] = useState<Viagem[]>(storageService.getViagens());
  const [filtro, setFiltro] = useState<FiltroAba>('TODAS');
  const [busca, setBusca] = useState('');

  const [modalNovaAberto, setModalNovaAberto] = useState(false);
  const [viagemDetalhes, setViagemDetalhes] = useState<Viagem | null>(null);
  const [viagemFinalizar, setViagemFinalizar] = useState<Viagem | null>(null);
  const [viagemExpandidaId, setViagemExpandidaId] = useState<number | null>(null);
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

  const totais = useMemo(
    () => ({
      total: viagens.length,
      emAndamento: viagens.filter((v) => v.status === 'EM_ANDAMENTO').length,
      agendadas: viagens.filter((v) => v.status === 'AGENDADA').length,
      concluidas: viagens.filter((v) => v.status === 'CONCLUIDA').length,
    }),
    [viagens],
  );

  const filtradas = useMemo(() => {
    return viagens.filter((v) => {
      if (filtro === 'EM_ANDAMENTO' && v.status !== 'EM_ANDAMENTO') return false;
      if (filtro === 'AGENDADAS' && v.status !== 'AGENDADA') return false;
      if (filtro === 'CONCLUIDAS' && v.status !== 'CONCLUIDA') return false;
      if (filtro === 'FROTA' && v.tipo_operacao !== 'ADMINISTRATIVA') return false;
      if (filtro === 'SVO' && v.tipo_operacao !== 'SVO') return false;

      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const matchOrigem = v.origem.toLowerCase().includes(termo);
        const matchDestino = v.destino.toLowerCase().includes(termo);
        const matchMotorista = v.motorista_nome.toLowerCase().includes(termo);
        const matchPlaca = v.veiculo_placa.toLowerCase().includes(termo);
        const matchSolicitante = v.solicitante_nome.toLowerCase().includes(termo);
        if (!matchOrigem && !matchDestino && !matchMotorista && !matchPlaca && !matchSolicitante) {
          return false;
        }
      }
      return true;
    });
  }, [viagens, filtro, busca]);

  const handleSalvarNovaViagem = (nova: Omit<Viagem, 'id'>) => {
    try {
      storageService.createViagem(nova);
      setViagens(storageService.getViagens());
      exibirFeedback(`Viagem agendada com sucesso!`);
    } catch (error: any) {
      exibirFeedback(error.message, true);
    }
  };

  const handleFinalizarViagem = (dados: { km_final: number; data_hora_efetiva_chegada: string }) => {
    if (!viagemFinalizar) return;
    try {
      storageService.updateViagem(viagemFinalizar.id, {
        ...dados,
        status: 'CONCLUIDA',
      });
      setViagens(storageService.getViagens());
      exibirFeedback(`Viagem #${viagemFinalizar.id} finalizada com sucesso.`);
      setViagemFinalizar(null);
    } catch (error: any) {
      exibirFeedback(error.message, true);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '20px', minWidth: 0, width: '100%' }}>
      {mensagemSucesso && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-success)',
            color: 'var(--color-success)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {mensagemErro && (
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-danger)',
            color: 'var(--color-danger)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ fontSize: '18px' }}>❌</span>
          <span>{mensagemErro}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-text)')}>{totais.total}</div>
          <div style={cardRotulo}>Total de Viagens</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-primary)')}>{totais.emAndamento}</div>
          <div style={cardRotulo}>Em Andamento</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-purple)')}>{totais.agendadas}</div>
          <div style={cardRotulo}>Agendadas</div>
        </Card>
        <Card style={{ padding: '16px 20px' }}>
          <div style={cardValor('var(--color-success)')}>{totais.concluidas}</div>
          <div style={cardRotulo}>Concluídas</div>
        </Card>
      </div>

      <Card>
        <TableToolbar
          title="Registro de Viagens"
          subtitle={`${filtradas.length} viagens exibidas`}
          newLabel="Nova Viagem"
          onNew={() => setModalNovaAberto(true)}
        />

        <div
          style={{
            display: 'flex',
            gap: '12px',
            padding: '12px 20px',
            borderBottom: '1px solid var(--color-divider)',
            background: 'var(--color-surface-alt)',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {([
              { id: 'TODAS', label: 'Todas' },
              { id: 'EM_ANDAMENTO', label: 'Em Andamento' },
              { id: 'AGENDADAS', label: 'Agendadas' },
              { id: 'CONCLUIDAS', label: 'Concluídas' },
              { id: 'FROTA', label: 'Frota' },
              { id: 'SVO', label: 'SVO' },
            ] as const).map((aba) => (
              <button
                key={aba.id}
                onClick={() => setFiltro(aba.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: filtro === aba.id ? 'var(--color-primary)' : 'transparent',
                  color: filtro === aba.id ? '#ffffff' : 'var(--color-text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                {aba.label}
              </button>
            ))}
          </div>

          <div style={{ minWidth: '220px', flex: '1', maxWidth: '320px' }}>
            <input
              type="text"
              placeholder="Buscar por trajeto, condutor ou placa..."
              value={busca}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: '13px',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Operação</th>
              <th>Origem / Destino</th>
              <th>Horários</th>
              <th>Motorista</th>
              <th>Veículo</th>
              <th>Odômetro / Km</th>
              <th>Status</th>
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap', width: '100px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
                  Nenhuma viagem encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtradas.map((v) => {
                const kmRodados =
                  v.km_final !== null && v.km_final !== undefined
                    ? v.km_final - v.km_inicial
                    : null;
                const estaExpandida = viagemExpandidaId === v.id;

                return (
                  <Fragment key={v.id}>
                    <tr
                      onClick={() => setViagemExpandidaId(estaExpandida ? null : v.id)}
                      style={{
                        cursor: 'pointer',
                        background: estaExpandida ? 'var(--color-primary-soft)' : undefined,
                        transition: 'background 0.15s ease',
                      }}
                      title="Clique para ver o manifesto / ticket desta viagem"
                    >
                      <td>
                        <IdBadge id={`#${v.id}`} />
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: v.tipo_operacao === 'ADMINISTRATIVA' ? '#EFF6FF' : '#F5F3FF',
                            color: v.tipo_operacao === 'ADMINISTRATIVA' ? '#1D4ED8' : '#6D28D9',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {v.tipo_operacao === 'ADMINISTRATIVA' ? 'Frota' : 'SVO'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '170px', maxWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                            <MapPin size={13} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>
                              {v.origem}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', paddingLeft: '8px' }}>
                            <span style={{ color: 'var(--color-text-subtle)', fontSize: '11px', flexShrink: 0 }}>↳</span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
                              {v.destino}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {v.status === 'AGENDADA' ? (
                            <>
                              <span style={{ color: 'var(--color-purple)', fontWeight: 600 }}>
                                <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 500 }}>Partida: </span>
                                {formatarDataHora(v.data_hora_efetiva_saida)}
                              </span>
                              <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
                                Aguardando saída
                              </span>
                            </>
                          ) : (
                            <>
                              <span style={{ color: 'var(--color-text)' }}>
                                <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Saída: </span>
                                {formatarDataHora(v.data_hora_efetiva_saida)}
                              </span>
                              {v.data_hora_efetiva_chegada ? (
                                <span style={{ color: 'var(--color-text-muted)' }}>
                                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Chegada: </span>
                                  {formatarDataHora(v.data_hora_efetiva_chegada)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--color-primary)', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }} />
                                  Em trânsito
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                          <Avatar name={v.motorista_nome} size={26} />
                          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>
                            {v.motorista_nome}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: 'var(--color-text)',
                              background: 'var(--color-surface-alt)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              border: '1px solid var(--color-border)',
                              width: 'fit-content',
                            }}
                          >
                            {v.veiculo_placa}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            {v.veiculo_modelo}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', whiteSpace: 'nowrap' }}>
                          {kmRodados !== null ? (
                            <>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-success)' }}>
                                {kmRodados} km rodados
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                {v.km_inicial.toLocaleString('pt-BR')} → {v.km_final?.toLocaleString('pt-BR')} km
                              </span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)' }}>
                                {v.km_inicial.toLocaleString('pt-BR')} km
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                Odômetro inicial
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <Badge tone={obterBadgeToneStatus(v.status)}>
                          {LABELS_STATUS_VIAGEM[v.status]}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {v.status === 'EM_ANDAMENTO' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViagemFinalizar(v);
                              }}
                              title="Registrar retorno da viagem"
                            >
                              <Flag size={13} style={{ marginRight: '3px' }} /> Finalizar
                            </Button>
                          )}
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: estaExpandida ? 'var(--color-primary)' : 'var(--color-surface-hover)',
                              color: estaExpandida ? '#ffffff' : 'var(--color-text-muted)',
                              border: '1px solid var(--color-border)',
                              transition: 'all 0.2s ease',
                            }}
                            title={estaExpandida ? 'Recolher manifesto' : 'Abrir manifesto da viagem'}
                          >
                            <ChevronDown
                              size={14}
                              style={{
                                transform: estaExpandida ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s ease',
                              }}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                    {estaExpandida && (
                      <tr style={{ background: 'var(--color-primary-soft)' }}>
                        <td colSpan={9} style={{ padding: '0 20px 16px', borderTop: 'none' }}>
                          <TicketViagem
                            viagem={v}
                            onFinalizar={() => setViagemFinalizar(v)}
                            onRecolher={() => setViagemExpandidaId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
          <Pagination showing={`1–${filtradas.length}`} total={filtradas.length} />
        </Table>
      </Card>

      {/* Modais */}
      {modalNovaAberto && (
        <ModalNovaViagem
          solicitacoesAprovadas={[]} // Aqui precisaremos de um mock/service de solicitações
          veiculos={storageService.getVeiculos()}
          motoristas={storageService.getMotoristas()}
          onClose={() => setModalNovaAberto(false)}
          onSalvar={handleSalvarNovaViagem}
        />
      )}

      {viagemDetalhes && (
        <ModalDetalhesViagem
          viagem={viagemDetalhes}
          onClose={() => setViagemDetalhes(null)}
          onFinalizar={(v) => {
            setViagemDetalhes(null);
            setViagemFinalizar(v);
          }}
        />
      )}

      {viagemFinalizar && (
        <ModalFinalizarViagem
          viagem={viagemFinalizar}
          onClose={() => setViagemFinalizar(null)}
          onSalvar={handleFinalizarViagem}
        />
      )}
    </div>
  );
}
