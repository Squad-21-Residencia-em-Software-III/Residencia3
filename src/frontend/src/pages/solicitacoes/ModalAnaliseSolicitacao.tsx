import { useEffect, useState } from 'react';
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
import { Alert, Avatar, Badge, Button, IdBadge, Modal, PlacaMercosul, Textarea } from '../../components/ui';
import type { BadgeTone } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemDeErro } from '../../services/api/http';
import { solicitacoesApi } from '../../services/api/solicitacoesApi';
import type {
  DisponibilidadeSolicitacao,
  SolicitacaoViagem,
  StatusSolicitacao,
} from '../../types/solicitacao';
import { LABELS_STATUS_SOLICITACAO } from '../../types/solicitacao';
import { PERFIS } from '../../types/usuario';
import { cn } from '../../utils/cn';

interface ModalAnaliseSolicitacaoProps {
  solicitacao: SolicitacaoViagem | null;
  onClose: () => void;
  onAprovar: (id: number) => Promise<void>;
  onRecusar: (id: number, motivo?: string) => Promise<void>;
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
  const [processando, setProcessando] = useState(false);
  const [disponibilidade, setDisponibilidade] = useState<DisponibilidadeSolicitacao | null>(null);
  const [carregandoDisponibilidade, setCarregandoDisponibilidade] = useState(false);
  const [erroDisponibilidade, setErroDisponibilidade] = useState<string | null>(null);

  // Consulta de disponibilidade no período pretendido (SCRUM-73).
  // A API libera essa rota somente para o Gestor de Frota.
  const { temPerfil } = useAuth();
  const podeConsultarDisponibilidade = temPerfil(PERFIS.GESTOR_FROTA);
  const solicitacaoId = solicitacao?.id;

  useEffect(() => {
    if (!solicitacaoId || !podeConsultarDisponibilidade) return;
    let ativo = true;
    setCarregandoDisponibilidade(true);
    setErroDisponibilidade(null);
    solicitacoesApi
      .consultarDisponibilidade(solicitacaoId)
      .then((resultado) => {
        if (ativo) setDisponibilidade(resultado);
      })
      .catch((error) => {
        if (!ativo) return;
        setDisponibilidade(null);
        setErroDisponibilidade(mensagemDeErro(error));
      })
      .finally(() => {
        if (ativo) setCarregandoDisponibilidade(false);
      });
    return () => {
      ativo = false;
    };
  }, [solicitacaoId, podeConsultarDisponibilidade]);

  if (!solicitacao) return null;

  const handleConfirmarAprovacao = async () => {
    setErro(null);
    setProcessando(true);
    try {
      await onAprovar(solicitacao.id);
      onClose();
    } catch (error) {
      setErro(mensagemDeErro(error));
      setProcessando(false);
    }
  };

  const handleConfirmarRecusa = async () => {
    const motivoLimpo = motivoRecusa.trim();
    if (motivoLimpo.length > 200) {
      setErro('O motivo da recusa deve conter no máximo 200 caracteres.');
      return;
    }
    setErro(null);
    setProcessando(true);
    try {
      await onRecusar(solicitacao.id, motivoLimpo || undefined);
      onClose();
    } catch (error) {
      setErro(mensagemDeErro(error));
      setProcessando(false);
    }
  };

  const temRecursosDisponiveis =
    disponibilidade &&
    disponibilidade.veiculos_disponiveis.length > 0 &&
    disponibilidade.motoristas_disponiveis.length > 0;

  return (
    <Modal onClose={onClose} title={`Análise da Solicitação #${solicitacao.id}`} maxWidth="640px">
      <div className="grid gap-4 py-1">
        {erro && <Alert tone="danger">{erro}</Alert>}

        {/* 1. Header do Resumo: Solicitante e Status */}
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={solicitacao.solicitante_nome} size={42} />
            <div>
              <div className="flex items-center gap-2">
                <strong className="text-[15px] text-slate-900">
                  {solicitacao.solicitante_nome}
                </strong>
                <IdBadge id={`#${solicitacao.id}`} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                Unidade: {solicitacao.unidade_nome ?? 'Não informada'}
              </div>
            </div>
          </div>
          <Badge tone={obterToneStatus(solicitacao.status)}>
            {LABELS_STATUS_SOLICITACAO[solicitacao.status]}
          </Badge>
        </div>

        {/* 2. Trajeto e Horários */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Card Trajeto */}
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase">
              <MapPin size={13} className="text-primary" /> Trajeto Solicitado
            </div>
            <div className="text-[13px] font-semibold text-slate-900">{solicitacao.origem}</div>
            <div className="my-0.5 text-[11px] font-semibold text-primary">↓ destino</div>
            <div className="text-[13px] font-semibold text-slate-900">{solicitacao.destino}</div>
          </div>

          {/* Card Horários */}
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase">
              <Clock size={13} className="text-primary" /> Período Pretendido
            </div>
            <div className="text-xs text-slate-500">Saída desejada:</div>
            <div className="mb-1 text-[13px] font-semibold text-slate-900">
              {formatarDataHora(solicitacao.data_saida_desejada)}
            </div>
            {solicitacao.data_chegada_desejada && (
              <>
                <div className="text-xs text-slate-500">Retorno previsto:</div>
                <div className="text-[13px] font-semibold text-slate-900">
                  {formatarDataHora(solicitacao.data_chegada_desejada)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3. Finalidade e Justificativa */}
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase">
            <FileText size={13} /> Finalidade & Justificativa Institucional
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-slate-900">{solicitacao.finalidade}</p>
        </div>

        {/* 4. Validação de Disponibilidade de Recursos (SCRUM-73) */}
        {podeConsultarDisponibilidade && carregandoDisponibilidade && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Consultando disponibilidade no período...
          </div>
        )}
        {podeConsultarDisponibilidade && erroDisponibilidade && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Não foi possível consultar a disponibilidade: {erroDisponibilidade}
          </div>
        )}
        {disponibilidade && (
          <div
            className={cn(
              'rounded-md border px-4 py-3',
              temRecursosDisponiveis
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {temRecursosDisponiveis ? (
                  <ShieldCheck size={18} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={18} className="text-amber-600" />
                )}
                <strong
                  className={cn(
                    'text-[13px]',
                    temRecursosDisponiveis ? 'text-emerald-900' : 'text-amber-900',
                  )}
                >
                  Disponibilidade Operacional no Período
                </strong>
              </div>
              <Badge tone={temRecursosDisponiveis ? 'success' : 'warning'}>
                {temRecursosDisponiveis ? 'Recursos Livres' : 'Recursos Limitados'}
              </Badge>
            </div>

            <div className="mt-2 flex gap-4 text-xs text-slate-900">
              <div className="flex items-center gap-1">
                <Truck size={14} className="text-slate-500" />
                <strong>{disponibilidade.veiculos_disponiveis.length}</strong> veículos disponíveis
              </div>
              <div className="flex items-center gap-1">
                <User size={14} className="text-slate-500" />
                <strong>{disponibilidade.motoristas_disponiveis.length}</strong> motoristas
                habilitados
              </div>
            </div>

            <div className="mt-3 border-t border-black/5 pt-3">
              <div className="mb-1.5 text-[11px] font-semibold text-slate-500 uppercase">
                Veículos disponíveis no período
              </div>
              {disponibilidade.veiculos_disponiveis.length === 0 ? (
                <p className="m-0 text-xs text-amber-900">
                  Nenhum veículo disponível para o período solicitado.
                </p>
              ) : (
                <ul className="m-0 grid max-h-48 list-none gap-1.5 overflow-y-auto p-0">
                  {disponibilidade.veiculos_disponiveis.map((veiculo) => (
                    <li
                      key={veiculo.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <PlacaMercosul placa={veiculo.placa} size="sm" />
                        <span className="text-[13px] font-semibold text-slate-900">
                          {veiculo.modelo}
                        </span>
                      </div>
                      <span className="text-xs whitespace-nowrap text-slate-500">
                        {veiculo.capacidade_maxima} lugares
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* 5. Se já foi Recusada: Mostra o motivo gravado */}
        {solicitacao.status === 'RECUSADA' && solicitacao.motivo_recusa && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
            <div className="mb-0.5 text-[11px] font-semibold text-rose-700 uppercase">
              Motivo da Recusa Registrado
            </div>
            <div className="text-[13px] text-rose-700">{solicitacao.motivo_recusa}</div>
          </div>
        )}

        {/* 6. Modo de Recusa com Justificativa (SCRUM-74) */}
        {modoRecusa && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <Textarea
              id="motivo-recusa-input"
              label="Justificativa da Recusa (opcional, máx. 200 caracteres):"
              value={motivoRecusa}
              onChange={(e) => setMotivoRecusa(e.target.value)}
              placeholder="Ex: Veículos da categoria alocados em outra missão de urgência."
              maxLength={200}
              rows={3}
              className="bg-white text-[13px]"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {motivoRecusa.length}/200 caracteres
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setModoRecusa(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="danger-outline"
                  onClick={handleConfirmarRecusa}
                  disabled={processando}
                >
                  Confirmar Recusa
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 7. Barra de Ações do Rodapé (Aprovação / Recusa / Agendamento) */}
        <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>

          {solicitacao.status === 'PENDENTE_APROVACAO' && !modoRecusa && (
            <>
              <Button variant="danger-outline" onClick={() => setModoRecusa(true)}>
                <XCircle size={15} className="mr-1.5" />
                Recusar
              </Button>
              <Button variant="primary" onClick={handleConfirmarAprovacao} disabled={processando}>
                <CheckCircle2 size={15} className="mr-1.5" />
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
              Agendar Viagem <ArrowRight size={14} className="ml-1.5" />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
