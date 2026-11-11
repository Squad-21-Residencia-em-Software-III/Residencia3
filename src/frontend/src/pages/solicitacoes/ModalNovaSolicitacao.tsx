import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select, Textarea } from '../../components/ui';
import type { NovaSolicitacaoApiInput } from '../../types/solicitacao';
import type { Unidade } from '../../types/unidade';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemDeErro } from '../../services/api/http';
import { unidadesApi } from '../../services/api/unidadesApi';

interface ModalNovaSolicitacaoProps {
  onClose: () => void;
  onSalvar: (nova: NovaSolicitacaoApiInput) => Promise<void>;
}

export function ModalNovaSolicitacao({ onClose, onSalvar }: ModalNovaSolicitacaoProps) {
  const { usuario } = useAuth();

  const padraoSaida = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const padraoChegada = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16);

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeId] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [dataSaida, setDataSaida] = useState(padraoSaida);
  const [dataChegada, setDataChegada] = useState(padraoChegada);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    unidadesApi
      .listarOpcoes()
      .then((lista) => {
        if (ativo) setUnidades(lista);
      })
      .catch((error) => {
        if (ativo) setErro(`Não foi possível carregar as unidades: ${mensagemDeErro(error)}`);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);

    const orig = origem.trim();
    const dest = destino.trim();
    const fin = finalidade.trim();

    if (!unidadeId) {
      setErro('Selecione a unidade da solicitação.');
      return;
    }
    if (!orig) {
      setErro('Informe o local de origem.');
      return;
    }
    if (!dest) {
      setErro('Informe o destino da solicitação.');
      return;
    }
    if (!fin) {
      setErro('Descreva a finalidade institucional da solicitação.');
      return;
    }
    if (!dataSaida) {
      setErro('Informe a data e horário de saída pretendida.');
      return;
    }
    if (dataChegada && dataChegada <= dataSaida) {
      setErro('O horário de retorno previsto deve ser posterior à saída.');
      return;
    }

    const nova: NovaSolicitacaoApiInput = {
      unidade_id: Number(unidadeId),
      origem: orig,
      destino: dest,
      finalidade: fin,
      data_saida_desejada: new Date(dataSaida).toISOString(),
      data_chegada_desejada: dataChegada ? new Date(dataChegada).toISOString() : undefined,
    };

    setSalvando(true);
    try {
      await onSalvar(nova);
      onClose();
    } catch (error) {
      setErro(mensagemDeErro(error));
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Nova Solicitação de Viagem" maxWidth="560px">
      <form onSubmit={handleSubmit} className="grid gap-4">
        {erro && <Alert tone="danger">{erro}</Alert>}

        {/* Solicitante (usuário autenticado) e Unidade que analisará o pedido */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Solicitante" value={usuario?.nome ?? ''} disabled />
          <Select
            label="Unidade *"
            value={unidadeId}
            onChange={(e) => setUnidadeId(e.target.value)}
            required
          >
            <option value="">Selecione</option>
            {unidades.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.nome}
              </option>
            ))}
          </Select>
        </div>

        {/* Trajeto */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Local de Origem"
            placeholder="Ex: Sede FSPH - Aracaju"
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            maxLength={255}
            required
          />
          <Input
            label="Local de Destino"
            placeholder="Ex: HUSE - Hospital de Urgência"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            maxLength={255}
            required
          />
        </div>

        {/* Horários */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            type="datetime-local"
            label="Data/Hora de Saída Desejada"
            value={dataSaida}
            onChange={(e) => setDataSaida(e.target.value)}
            required
          />
          <Input
            type="datetime-local"
            label="Retorno Previsto (Opcional)"
            value={dataChegada}
            onChange={(e) => setDataChegada(e.target.value)}
          />
        </div>

        {/* Finalidade */}
        <Textarea
          id="nova-solicitacao-finalidade"
          label="Finalidade Institucional *"
          value={finalidade}
          onChange={(e) => setFinalidade(e.target.value)}
          placeholder="Descreva o motivo da viagem, passageiros previstos, transporte de cargas ou documentos..."
          rows={3}
          required
        />

        {/* Rodapé de Ações */}
        <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={salvando}>
            {salvando ? 'Cadastrando...' : 'Cadastrar Solicitação'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
