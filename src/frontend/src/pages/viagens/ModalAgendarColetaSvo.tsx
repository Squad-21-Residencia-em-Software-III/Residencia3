import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, Button, IdBadge, Input, Modal, Select } from '../../components/ui';
import { recursoAtivo } from '../../config/recursosBackend';
import { ApiError, mensagemDeErro } from '../../services/api/http';
import { veiculosApi } from '../../services/api/veiculosApi';
import { viagensApi } from '../../services/api/viagensApi';
import type { Motorista, StatusMotorista } from '../../types/motorista';
import type { OcupacaoVeiculoSvo, Veiculo } from '../../types/veiculo';
import {
  CODIGO_CONFIRMAR_INTERVALO,
  type AgendamentoColetaSvoInput,
  type ConflitoIntervaloSvo,
  type OrdemPendenteSvo,
} from '../../types/viagem';
import { motivoBloqueioSvo, OcupacaoVeiculoSvoPainel, rotuloOcupacao } from './OcupacaoVeiculoSvo';

interface ModalAgendarColetaSvoProps {
  ordem: OrdemPendenteSvo;
  veiculos: Veiculo[];
  motoristas: Motorista[];
  onClose: () => void;
  /** Chamado só depois que a API confirma o agendamento. */
  onAgendada: () => Promise<void> | void;
}

const MOTORISTA_BLOQUEADO: StatusMotorista[] = ['AFASTADO', 'INATIVO'];
const RECURSO_LABEL: Record<ConflitoIntervaloSvo['recurso'], string> = {
  VEICULO: 'Veículo',
  MOTORISTA: 'Motorista',
  EQUIPE: 'Equipe',
};

const horario = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** `datetime-local` (horário local do navegador) para ISO 8601 em UTC. */
const paraIso = (valor: string) => new Date(valor).toISOString();

function conflitosDoErro(error: ApiError): ConflitoIntervaloSvo[] {
  const contexto = error.contexto as { conflitos?: ConflitoIntervaloSvo[] } | undefined;
  return Array.isArray(contexto?.conflitos) ? contexto.conflitos : [];
}

/**
 * Agendar coleta de uma ordem SVO aguardando alocação (SCRUM-172), em Viagens > SVO.
 * Com o agendamento temporal do backend (SCRUM-182): período previsto, bloqueio de sobreposição
 * e segunda confirmação quando a folga para outra reserva for menor que 20 minutos. Antes dele,
 * aloca veículo e motorista para atendimento imediato, como a API atual faz.
 */
export function ModalAgendarColetaSvo({
  ordem,
  veiculos,
  motoristas,
  onClose,
  onAgendada,
}: ModalAgendarColetaSvoProps) {
  const comPeriodo = recursoAtivo('agendamentoTemporalSvo');
  const veiculosSvo = veiculos.filter((v) => v.tipo_frota === 'SVO' && v.status !== 'MANUTENCAO');
  const motoristasSvo = motoristas.filter(
    (m) => m.tipo_motorista === 'SVO' && !MOTORISTA_BLOQUEADO.includes(m.status),
  );

  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [veiculoId, setVeiculoId] = useState(veiculosSvo[0] ? String(veiculosSvo[0].id) : '');
  const [motoristaId, setMotoristaId] = useState(
    motoristasSvo[0] ? String(motoristasSvo[0].id) : '',
  );
  const [ocupacoes, setOcupacoes] = useState<OcupacaoVeiculoSvo[]>([]);
  const [erroOcupacao, setErroOcupacao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Pedido de segunda confirmação devolvido pelo servidor (intervalo menor que 20 min)
  const [conflitos, setConflitos] = useState<ConflitoIntervaloSvo[] | null>(null);
  const [ciente, setCiente] = useState(false);

  useEffect(() => {
    let ativo = true;
    veiculosApi
      .listarOcupacaoSvo()
      .then((dados) => ativo && setOcupacoes(dados))
      .catch((error) => ativo && setErroOcupacao(mensagemDeErro(error)));
    return () => {
      ativo = false;
    };
  }, []);

  const ocupacaoDoVeiculo = ocupacoes.find((o) => String(o.id) === veiculoId);
  const bloqueio = ocupacaoDoVeiculo ? motivoBloqueioSvo(ocupacaoDoVeiculo) : null;

  // Qualquer mudança invalida a confirmação anterior: o servidor precisa validar de novo
  const alterar = (setter: (valor: string) => void) => (valor: string) => {
    setter(valor);
    setConflitos(null);
    setCiente(false);
    setErro(null);
  };

  function validar(): string | null {
    if (!veiculoId || !motoristaId) return 'Selecione o veículo e o motorista da coleta.';
    if (bloqueio) return bloqueio;
    if (!comPeriodo) return null;
    if (!inicio || !fim) return 'Informe o início e o término previstos da coleta.';
    if (new Date(fim) <= new Date(inicio)) return 'O término previsto deve ser depois do início.';
    if (new Date(inicio) < new Date(Date.now() - 60_000)) {
      return 'O início previsto não pode estar no passado.';
    }
    return null;
  }

  async function enviar(confirmarIntervalo: boolean) {
    const dados: AgendamentoColetaSvoInput = {
      solicitacao_id: ordem.solicitacao_id,
      veiculo_id: Number(veiculoId),
      motorista_id: Number(motoristaId),
      ...(comPeriodo
        ? {
            inicio_previsto: paraIso(inicio),
            fim_previsto: paraIso(fim),
            ...(confirmarIntervalo ? { confirmar_intervalo_reduzido: true } : {}),
          }
        : {}),
    };

    setSalvando(true);
    setErro(null);
    try {
      await viagensApi.agendarColetaSvo(dados);
      await onAgendada();
      onClose();
    } catch (error) {
      setSalvando(false);
      if (
        comPeriodo &&
        !confirmarIntervalo &&
        error instanceof ApiError &&
        error.codigo === CODIGO_CONFIRMAR_INTERVALO
      ) {
        setConflitos(conflitosDoErro(error));
        setCiente(false);
        return;
      }
      // Sobreposição real, recurso ocupado, CNH ou capacidade: só a mensagem, sem forçar
      setConflitos(null);
      setErro(mensagemDeErro(error));
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problema = validar();
    if (problema) {
      setErro(problema);
      return;
    }
    void enviar(false);
  };

  return (
    <Modal title="Agendar coleta SVO" onClose={salvando ? () => {} : onClose} maxWidth="600px">
      <form onSubmit={handleSubmit} noValidate>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        <div className="mb-4 rounded-lg border border-divider bg-surface-alt p-3.5 text-sm">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {ordem.ordem_id !== null && <IdBadge id={`Ordem #${ordem.ordem_id}`} />}
            <span>Solicitação SVO #{ordem.solicitacao_id}</span>
          </div>
          <p className="mt-1 text-slate-600">{ordem.local_ocorrencia}</p>
          {ordem.material_sensivel && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
              <AlertTriangle size={12} /> Material sensível
            </p>
          )}
        </div>

        {comPeriodo ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Início previsto *"
              type="datetime-local"
              value={inicio}
              onChange={(e: ChangeEvent<HTMLInputElement>) => alterar(setInicio)(e.target.value)}
              required
            />
            <Input
              label="Término previsto *"
              type="datetime-local"
              value={fim}
              min={inicio || undefined}
              onChange={(e: ChangeEvent<HTMLInputElement>) => alterar(setFim)(e.target.value)}
              required
            />
          </div>
        ) : (
          <Alert tone="info" className="mb-3.5">
            A coleta será alocada para atendimento imediato.
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Veículo SVO *"
            value={veiculoId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => alterar(setVeiculoId)(e.target.value)}
            required
          >
            {veiculosSvo.length === 0 && <option value="">Nenhum veículo SVO disponível</option>}
            {veiculosSvo.map((v) => {
              const ocupacao = ocupacoes.find((o) => o.id === v.id);
              return (
                <option key={v.id} value={v.id}>
                  {v.modelo} ({v.placa}){ocupacao ? ` — ${rotuloOcupacao(ocupacao)}` : ''}
                </option>
              );
            })}
          </Select>

          <Select
            label="Motorista SVO *"
            value={motoristaId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              alterar(setMotoristaId)(e.target.value)
            }
            required
          >
            {motoristasSvo.length === 0 && <option value="">Nenhum motorista SVO disponível</option>}
            {motoristasSvo.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} (CNH {m.categoria_cnh})
              </option>
            ))}
          </Select>
        </div>

        {erroOcupacao && (
          <Alert tone="warning" className="mt-3.5">
            Não foi possível carregar a ocupação dos veículos: {erroOcupacao}
          </Alert>
        )}
        {ocupacaoDoVeiculo && <OcupacaoVeiculoSvoPainel veiculo={ocupacaoDoVeiculo} />}

        {conflitos && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900"
          >
            <p className="flex items-center gap-1.5 font-bold">
              <AlertTriangle size={15} /> Intervalo menor que 20 minutos
            </p>
            <p className="mt-1">
              Há pouco tempo livre entre esta coleta e outra reserva do mesmo recurso. Um atraso na
              coleta anterior pode atrasar esta.
            </p>
            {conflitos.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {conflitos.map((c, i) => (
                  <li key={i}>
                    {RECURSO_LABEL[c.recurso] ?? c.recurso} {c.descricao}: reserva de{' '}
                    {horario(c.inicio)} a {horario(c.fim)} ({c.intervalo_minutos} min de intervalo)
                  </li>
                ))}
              </ul>
            )}
            <label className="mt-3 flex items-start gap-2 font-medium">
              <input
                type="checkbox"
                checked={ciente}
                onChange={(e) => setCiente(e.target.checked)}
                className="mt-0.5"
              />
              Estou ciente do intervalo reduzido e quero agendar mesmo assim.
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          {conflitos ? (
            <Button
              type="button"
              onClick={() => void enviar(true)}
              disabled={!ciente || salvando}
            >
              {salvando ? 'Agendando...' : 'Confirmar agendamento'}
            </Button>
          ) : (
            <Button type="submit" disabled={salvando || Boolean(bloqueio)}>
              {salvando ? 'Agendando...' : 'Agendar coleta'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
