import { useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Input, Modal } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import { viagensApi } from '../../services/api/viagensApi';
import type { ReprogramarViagemAdministrativaInput, Viagem } from '../../types/viagem';

export function podeReprogramarAdministrativa(viagem: Viagem, podeAgendar: boolean): boolean {
  return podeAgendar && viagem.tipo_operacao === 'ADMINISTRATIVA' && viagem.status === 'AGENDADA' &&
    viagem.pode_reprogramar === true && !viagem.data_hora_efetiva_saida && !viagem.data_hora_efetiva_chegada &&
    typeof viagem.versao_programacao === 'number';
}

function paraCampoLocal(valor?: string | null): string {
  if (!valor) return '';
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return '';
  // Preserva segundos e milissegundos do período quando não há alteração (não cria falso A6).
  return new Date(data.getTime() - data.getTimezoneOffset() * 60_000).toISOString().slice(0, 23);
}

function exibirData(valor?: string | null): string {
  return valor ? new Date(valor).toLocaleString('pt-BR') : 'Não informado';
}

interface Props {
  viagem: Viagem;
  onClose: () => void;
  onSalva: () => void | Promise<void>;
}

export function ModalReprogramarAdministrativa({ viagem, onClose, onSalva }: Props) {
  const [inicio, setInicio] = useState(() => paraCampoLocal(viagem.inicio_previsto));
  const [fim, setFim] = useState(() => paraCampoLocal(viagem.fim_previsto));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const emCurso = useRef(false);
  // A mesma combinação de dados reaproveita a chave em retries, inclusive após erro de rede.
  const comandos = useRef(new Map<string, string>());

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emCurso.current) return;
    if (!podeReprogramarAdministrativa(viagem, true) || viagem.versao_programacao == null) {
      setErro('Esta viagem não pode ser reprogramada. Atualize a listagem.');
      return;
    }
    const novoInicio = new Date(inicio), novoFim = new Date(fim);
    if (!Number.isFinite(novoInicio.getTime()) || !Number.isFinite(novoFim.getTime()) || novoFim <= novoInicio) {
      setErro('O término planejado deve ser posterior ao início.');
      return;
    }
    emCurso.current = true;
    setSalvando(true);
    setErro('');
    try {
      const dados = { inicio_previsto: novoInicio.toISOString(), fim_previsto: novoFim.toISOString(),
        versao_programacao: viagem.versao_programacao };
      const identidade = JSON.stringify(dados);
      const chave = comandos.current.get(identidade) ?? crypto.randomUUID();
      comandos.current.set(identidade, chave);
      const pedido: ReprogramarViagemAdministrativaInput = { ...dados, chave_idempotencia: chave };
      await viagensApi.reprogramarAdministrativa(viagem.id, pedido);
      await onSalva();
    } catch (error) {
      setErro(mensagemDeErro(error));
    } finally {
      emCurso.current = false;
      setSalvando(false);
    }
  }

  return (
    <Modal title={`Reprogramar viagem #${viagem.id}`} onClose={() => { if (!emCurso.current) onClose(); }} telaInteira>
      <form onSubmit={enviar} className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-3 text-sm break-words">
          <p className="font-semibold">Solicitação #{viagem.solicitacao_id}</p>
          <p>Solicitado: {exibirData(viagem.inicio_solicitado)} até {exibirData(viagem.fim_solicitado)}</p>
          <p>Planejado atual: {exibirData(viagem.inicio_previsto)} até {exibirData(viagem.fim_previsto)}</p>
          <p className="mt-2">Motorista: {viagem.motorista_nome} · Veículo: {viagem.veiculo_placa}</p>
          <p className="mt-1 text-xs text-slate-600">A aprovação original e os recursos permanecem vinculados.</p>
        </div>
        {erro && <div role="alert"><Alert tone="danger">{erro}</Alert></div>}
        <Input label="Novo início planejado" type="datetime-local" step="0.001" required value={inicio}
          disabled={salvando} onChange={(e) => setInicio(e.target.value)} />
        <Input label="Novo término planejado" type="datetime-local" step="0.001" required value={fim}
          disabled={salvando} onChange={(e) => setFim(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={onClose}>Voltar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar reprogramação'}</Button>
        </div>
      </form>
    </Modal>
  );
}
