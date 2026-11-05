import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  ShieldCheck,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { Avatar, Badge, Button, IdBadge, Modal } from '../../components/ui';
import type { BadgeTone } from '../../components/ui';
import type { SolicitacaoViagem, StatusSolicitacao } from '../../types/solicitacao';
import { LABELS_STATUS_SOLICITACAO } from '../../types/solicitacao';
import { storageService } from '../../services/storageService';

interface ModalAnaliseSolicitacaoProps {
  solicitacao: SolicitacaoViagem | null;
  onClose: () => void;
  onAprovar: (id: number) => void;
  onRecusar: (id: number, motivo?: string) => void;
  onAgendar?: (solicitacao: SolicitacaoViagem) => void;
}

function obterToneStatus(status: StatusSolicitacao): BadgeTone {
  switch (status) {
    case 'PENDENTE_APROVACAO':
      return 'warning';
    case 'APROVADA':
    case 'CONCLUIDA':
      return 'success';
    case 'AGENDADA':
      return 'info';
    case 'RECUSADA':
      return 'danger';
    case 'CANCELADA':
    default:
      return 'neutral';
  }
}

function formatarDataHora(iso?: string | null): string {
  if (!iso) return 'Não informada';
  try {
    const data = new Date(iso);
    if (isNaN(data.getTime())) return iso;
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    const horas = String(data.getHours()).padStart(2, '0');
    const minutos = String(data.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} às ${horas}:${minutos}`;
  } catch {
    return iso;
  }
}

export function ModalAnaliseSolicitacao({
  solicitacao,
  onClose,
  onAprovar,
  onRecusar,
  onAgendar,
}: ModalAnaliseSolicitacaoProps) {
  const [modoRecusa, setModoRecusa] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  // Consulta de disponibilidade no período pretendido (SCRUM-73)
  const disponibilidade = useMemo(() => {
    if (!solicitacao) return null;
    try {
      return storageService.consultarDisponibilidade(solicitacao.id);
    } catch {
      return null;
    }
  }, [solicitacao]);

  if (!solicitacao) return null;

  const handleConfirmarAprovacao = () => {
    try {
      onAprovar(solicitacao.id);
      onClose();
    } catch (e: any) {
      setErro(e.message || 'Erro ao aprovar solicitação.');
    }
  };

  const handleConfirmarRecusa = () => {
    const motivoLimpo = motivoRecusa.trim();
    if (motivoLimpo.length > 200) {
      setErro('O motivo da recusa deve conter no máximo 200 caracteres.');
      return;
    }
    try {
      onRecusar(solicitacao.id, motivoLimpo || undefined);
      onClose();
    } catch (e: any) {
      setErro(e.message || 'Erro ao recusar solicitação.');
    }
  };

  const temRecursosDisponiveis =
    disponibilidade &&
    disponibilidade.veiculos_disponiveis.length > 0 &&
    disponibilidade.motoristas_disponiveis.length > 0;

  return (
    <Modal
      onClose={onClose}
      title={`Análise da Solicitação #${solicitacao.id}`}
      maxWidth="640px"
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-1) 0' }}>
        {erro && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-danger-subtle, #fee2e2)',
              color: 'var(--color-danger, #b91c1c)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {erro}
          </div>
        )}

        {/* 1. Header do Resumo: Solicitante e Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface-subtle, #f8fafc)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Avatar name={solicitacao.solicitante_nome} size={42} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <strong style={{ fontSize: '15px', color: 'var(--color-text)' }}>
                  {solicitacao.solicitante_nome}
                </strong>
                <IdBadge id={`#${solicitacao.id}`} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Solicitante institucional cadastrado
              </div>
            </div>
          </div>
          <Badge tone={obterToneStatus(solicitacao.status)}>
            {LABELS_STATUS_SOLICITACAO[solicitacao.status]}
          </Badge>
        </div>

        {/* 2. Trajeto e Horários */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {/* Card Trajeto */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
              }}
            >
              <MapPin size={13} color="var(--color-primary)" /> Trajeto Solicitado
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
              {solicitacao.origem}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-primary)',
                margin: '2px 0',
                fontWeight: 600,
              }}
            >
              ↓ destino
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
              {solicitacao.destino}
            </div>
          </div>

          {/* Card Horários */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
              }}
            >
              <Clock size={13} color="var(--color-primary)" /> Período Pretendido
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Saída desejada:
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>
              {formatarDataHora(solicitacao.data_saida_desejada)}
            </div>
            {solicitacao.data_chegada_desejada && (
              <>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Retorno previsto:
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                  {formatarDataHora(solicitacao.data_chegada_desejada)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3. Finalidade e Justificativa */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-3) var(--space-4)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
            }}
          >
            <FileText size={13} /> Finalidade & Justificativa Institucional
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.5 }}>
            {solicitacao.finalidade}
          </p>
        </div>

        {/* 4. Validação de Disponibilidade de Recursos (SCRUM-73) */}
        {disponibilidade && (
          <div
            style={{
              background: temRecursosDisponiveis
                ? 'var(--color-success-subtle, #ecfdf5)'
                : 'var(--color-warning-subtle, #fffbeb)',
              border: `1px solid ${
                temRecursosDisponiveis
                  ? 'var(--color-success-border, #a7f3d0)'
                  : 'var(--color-warning-border, #fde68a)'
              }`,
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {temRecursosDisponiveis ? (
                  <ShieldCheck size={18} color="var(--color-success, #059669)" />
                ) : (
                  <AlertTriangle size={18} color="var(--color-warning, #d97706)" />
                )}
                <strong
                  style={{
                    fontSize: '13px',
                    color: temRecursosDisponiveis
                      ? 'var(--color-success-text, #065f46)'
                      : 'var(--color-warning-text, #92400e)',
                  }}
                >
                  Disponibilidade Operacional no Período
                </strong>
              </div>
              <Badge tone={temRecursosDisponiveis ? 'success' : 'warning'}>
                {temRecursosDisponiveis ? 'Recursos Livres' : 'Recursos Limitados'}
              </Badge>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                marginTop: 'var(--space-2)',
                fontSize: '12px',
                color: 'var(--color-text)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Truck size={14} color="var(--color-text-muted)" />
                <strong>{disponibilidade.veiculos_disponiveis.length}</strong> veículos disponíveis
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={14} color="var(--color-text-muted)" />
                <strong>{disponibilidade.motoristas_disponiveis.length}</strong> motoristas habilitados
              </div>
            </div>
          </div>
        )}

        {/* 5. Se já foi Recusada: Mostra o motivo gravado */}
        {solicitacao.status === 'RECUSADA' && solicitacao.motivo_recusa && (
          <div
            style={{
              background: 'var(--color-danger-subtle, #fef2f2)',
              border: '1px solid var(--color-danger-border, #fecaca)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-danger)', textTransform: 'uppercase', marginBottom: '2px' }}>
              Motivo da Recusa Registrado
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-danger)' }}>
              {solicitacao.motivo_recusa}
            </div>
          </div>
        )}

        {/* 6. Modo de Recusa com Justificativa (SCRUM-74) */}
        {modoRecusa && (
          <div
            style={{
              background: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            <label
              htmlFor="motivo-recusa-input"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Justificativa da Recusa (opcional, máx. 200 caracteres):
            </label>
            <textarea
              id="motivo-recusa-input"
              value={motivoRecusa}
              onChange={(e) => setMotivoRecusa(e.target.value)}
              placeholder="Ex: Veículos da categoria alocados em outra missão de urgência."
              maxLength={200}
              rows={3}
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {motivoRecusa.length}/200 caracteres
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button size="sm" variant="ghost" onClick={() => setModoRecusa(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                  onClick={handleConfirmarRecusa}
                >
                  Confirmar Recusa
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 7. Barra de Ações do Rodapé (Aprovação / Recusa / Agendamento) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-2)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-divider)',
          }}
        >
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>

          {solicitacao.status === 'PENDENTE_APROVACAO' && !modoRecusa && (
            <>
              <Button
                variant="outline"
                style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                onClick={() => setModoRecusa(true)}
              >
                <XCircle size={15} style={{ marginRight: '6px' }} />
                Recusar
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmarAprovacao}
              >
                <CheckCircle2 size={15} style={{ marginRight: '6px' }} />
                Aprovar Solicitação
              </Button>
            </>
          )}

          {solicitacao.status === 'APROVADA' && onAgendar && (
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                onAgendar(solicitacao);
              }}
            >
              Agendar Viagem <ArrowRight size={14} style={{ marginLeft: '6px' }} />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
