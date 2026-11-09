import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import type { Viagem } from '../../types/viagem';

interface ModalIniciarViagemProps {
  viagem: Viagem;
  onClose: () => void;
  onSalvar: (kmInicial: number) => Promise<void>;
}

export function ModalIniciarViagem({ viagem, onClose, onSalvar }: ModalIniciarViagemProps) {
  const [kmInicial, setKmInicial] = useState<string>('');
  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const kmInicialNum = Number(kmInicial);
    if (!kmInicial || !Number.isInteger(kmInicialNum) || kmInicialNum < 0) {
      setErro('Informe o odômetro de saída como um número inteiro.');
      return;
    }

    setSalvando(true);
    try {
      await onSalvar(kmInicialNum);
      onClose();
    } catch (error) {
      setErro(mensagemDeErro(error));
      setSalvando(false);
    }
  };

  return (
    <Modal title={`Iniciar Viagem #${viagem.id}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px]">
          <div className="font-bold text-slate-900">
            {viagem.origem ?? '—'} → {viagem.destino ?? '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Veículo:{' '}
            <strong>
              {viagem.veiculo_modelo} ({viagem.veiculo_placa})
            </strong>{' '}
            • Motorista: <strong>{viagem.motorista_nome}</strong>
          </div>
        </div>

        <Input
          label="Odômetro de Saída (Km Inicial) *"
          type="number"
          placeholder="Ex: 35000"
          value={kmInicial}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmInicial(e.target.value)}
          min={0}
          required
        />

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Iniciando...' : 'Confirmar Saída'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
