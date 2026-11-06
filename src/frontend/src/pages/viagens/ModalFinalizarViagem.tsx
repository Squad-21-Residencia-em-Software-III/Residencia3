import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import type { Viagem } from '../../types/viagem';

interface ModalFinalizarViagemProps {
  viagem: Viagem;
  onClose: () => void;
  onSalvar: (kmFinal: number) => Promise<void>;
}

export function ModalFinalizarViagem({ viagem, onClose, onSalvar }: ModalFinalizarViagemProps) {
  const kmInicial = viagem.km_inicial ?? 0;

  const [kmFinal, setKmFinal] = useState<string>('');
  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);

  const kmFinalNum = Number(kmFinal);
  const kmRodados =
    kmFinal && !isNaN(kmFinalNum) && kmFinalNum >= kmInicial
      ? kmFinalNum - kmInicial
      : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!kmFinal || !Number.isInteger(kmFinalNum)) {
      setErro('Informe o odômetro final como um número inteiro.');
      return;
    }

    if (kmFinalNum < kmInicial) {
      setErro(
        `O odômetro final (${kmFinalNum} km) não pode ser menor que o odômetro inicial (${kmInicial} km).`,
      );
      return;
    }

    setSalvando(true);
    try {
      await onSalvar(kmFinalNum);
      onClose();
    } catch (error) {
      setErro(mensagemDeErro(error));
      setSalvando(false);
    }
  };

  return (
    <Modal title={`Registrar Retorno da Viagem #${viagem.id}`} onClose={onClose}>
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
          <div style={{ color: 'var(--color-primary)', fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>
            Odômetro de saída (Km inicial): {kmInicial.toLocaleString('pt-BR')} km
          </div>
        </div>

        <Input
          label="Odômetro Final (Km de Retorno) *"
          type="number"
          placeholder={`Maior que ${kmInicial}`}
          value={kmFinal}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmFinal(e.target.value)}
          min={kmInicial}
          required
        />

        {kmRodados !== null && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: '#DCFCE7',
              color: '#15803D',
              fontSize: '12px',
              fontWeight: 700,
              marginTop: '-8px',
              marginBottom: '16px',
            }}
          >
            ✓ Distância percorrida apurada: {kmRodados.toLocaleString('pt-BR')} km
          </div>
        )}

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Concluindo...' : 'Confirmar Chegada e Concluir'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
