import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal } from '../../components/ui';
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
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>{erro}</p>
        )}

        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border)',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>
            {viagem.origem ?? '—'} → {viagem.destino ?? '—'}
          </div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '2px' }}>
            Veículo: <strong>{viagem.veiculo_modelo} ({viagem.veiculo_placa})</strong> • Motorista: <strong>{viagem.motorista_nome}</strong>
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

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
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
