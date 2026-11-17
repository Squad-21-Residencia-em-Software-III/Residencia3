import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Input, Modal, Textarea } from '../../components/ui';
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
  const [sensivel, setSensivel] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const trava = useRef(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (trava.current) return;
    if (!solicitante.trim() || !local.trim()) {
      setErro('Informe os dados do solicitante e o local da ocorrência.');
      return;
    }
    trava.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const criada = await solicitacoesSvoApi.criar({
        dados_solicitante: solicitante.trim(),
        local_ocorrencia: local.trim(),
        material_sensivel: sensivel,
      });
      onCriada(criada.id);
    } catch (error) {
      setErro(mensagemDeErro(error));
      trava.current = false;
      setEnviando(false);
    }
  }

  return (
    <Modal title="Nova solicitação SVO" maxWidth="560px" onClose={enviando ? () => {} : onClose} hideFooter>
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
        <Textarea
          id="local-ocorrencia-svo"
          label="Local da ocorrência *"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          required
          maxLength={255}
          placeholder="Informe o local da ocorrência"
          rows={3}
          disabled={enviando}
        />
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={sensivel}
            onChange={(e) => setSensivel(e.target.checked)}
            disabled={enviando}
          />
          Material sensível
        </label>
        <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Registrar solicitação'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
