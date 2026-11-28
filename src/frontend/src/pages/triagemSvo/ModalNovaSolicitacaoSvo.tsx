import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Input, Modal, ModalFooter, Textarea } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { solicitacoesSvoApi } from '../../services/api/solicitacoesSvoApi';
import { mensagemDeErro } from '../../services/api/http';

export function ModalNovaSolicitacaoSvo({
  onClose,
  onCriada,
}: {
  onClose: () => void;
  onCriada: (id: number) => void;
}) {
  const { usuario } = useAuth();
  const [solicitante, setSolicitante] = useState('');
  const [local, setLocal] = useState('');
  const [destino, setDestino] = useState('');
  const [saida, setSaida] = useState('');
  const [retorno, setRetorno] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const trava = useRef(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (trava.current) return;
    if (!solicitante.trim() || !local.trim() || !destino.trim() || !saida || !finalidade.trim()) {
      setErro('Preencha os campos obrigatórios da solicitação.');
      return;
    }
    if (retorno && retorno <= saida) {
      setErro('O horário de retorno previsto deve ser posterior à saída.');
      return;
    }
    const detalhes = `${solicitante.trim()}\nDestino: ${destino.trim()}\nSaída desejada: ${saida}\n${retorno ? `Retorno previsto: ${retorno}\n` : ''}Finalidade: ${finalidade.trim()}`;
    if (detalhes.length > 2000) {
      setErro('Os dados da solicitação excedem o limite permitido.');
      return;
    }
    trava.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const criada = await solicitacoesSvoApi.criar({
        dados_solicitante: detalhes,
        local_ocorrencia: local.trim(),
      });
      onCriada(criada.id);
    } catch (error) {
      setErro(mensagemDeErro(error));
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <Modal title="Nova solicitação SVO" maxWidth="560px" onClose={onClose} bloquearFechamento={enviando}>
      <form onSubmit={enviar} className="grid gap-4">
        {erro && <Alert tone="danger">{erro}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Registrado por" value={usuario?.nome ?? ''} disabled />
          <Input label="Unidade" value="SVO" readOnly />
        </div>
        <Textarea
          id="dados-solicitante-svo"
          label="Dados do solicitante *"
          value={solicitante}
          onChange={(e) => setSolicitante(e.target.value)}
          required
          maxLength={2000}
          placeholder="Informe os dados do solicitante"
          rows={3}
          disabled={enviando}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="local-ocorrencia-svo"
          label="Local de origem da ocorrência *"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          required
          maxLength={255}
          placeholder="Informe o local de origem da ocorrência"
          className="text-ellipsis"
          disabled={enviando}
        />
        <Input label="Local de Destino *" placeholder="Informe o destino da ocorrência" className="text-ellipsis" value={destino} onChange={(e) => setDestino(e.target.value)} required maxLength={255} disabled={enviando} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input type="datetime-local" label="Data/Hora de Saída Desejada *" value={saida} onChange={(e) => setSaida(e.target.value)} required disabled={enviando} />
          <Input type="datetime-local" label="Retorno Previsto (Opcional)" value={retorno} onChange={(e) => setRetorno(e.target.value)} disabled={enviando} />
        </div>
        <Textarea label="Finalidade Institucional *" placeholder="Descreva a finalidade da viagem" value={finalidade} onChange={(e) => setFinalidade(e.target.value)} required rows={3} maxLength={1500} disabled={enviando} />
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Registrar solicitação'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
