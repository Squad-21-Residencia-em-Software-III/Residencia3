import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal } from '../../components/ui';
import type { Viagem } from '../../types/viagem';

interface ModalFinalizarViagemProps {
  viagem: Viagem;
  onClose: () => void;
  onSalvar: (dados: { km_final: number; data_hora_efetiva_chegada: string }) => void;
}

export function ModalFinalizarViagem({ viagem, onClose, onSalvar }: ModalFinalizarViagemProps) {
  const agoraIso = new Date().toISOString().slice(0, 16);

  const [kmFinal, setKmFinal] = useState<string>('');
  const [dataChegada, setDataChegada] = useState<string>(agoraIso);
  const [erro, setErro] = useState<string>('');

  const kmFinalNum = Number(kmFinal);
  const kmRodados =
    kmFinal && !isNaN(kmFinalNum) && kmFinalNum >= viagem.km_inicial
      ? kmFinalNum - viagem.km_inicial
      : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!kmFinal || isNaN(kmFinalNum)) {
      setErro('Informe o valor do odômetro final.');
      return;
    }

    if (kmFinalNum < viagem.km_inicial) {
      setErro(
        `O odômetro final (${kmFinalNum} km) não pode ser menor que o odômetro inicial (${viagem.km_inicial} km).`,
      );
      return;
    }

    if (!dataChegada) {
      setErro('Informe a data e hora de chegada.');
      return;
    }

    onSalvar({
      km_final: kmFinalNum,
      data_hora_efetiva_chegada: `${dataChegada}:00`,
    });

    onClose();
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
            {viagem.origem} → {viagem.destino}
          </div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '2px' }}>
            Veículo: <strong>{viagem.veiculo_modelo} ({viagem.veiculo_placa})</strong> • Motorista: <strong>{viagem.motorista_nome}</strong>
          </div>
          <div style={{ color: 'var(--color-primary)', fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>
            Odômetro de saída (Km inicial): {viagem.km_inicial.toLocaleString('pt-BR')} km
          </div>
        </div>

        <Input
          label="Odômetro Final (Km de Retorno) *"
          type="number"
          placeholder={`Maior que ${viagem.km_inicial}`}
          value={kmFinal}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmFinal(e.target.value)}
          min={viagem.km_inicial}
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

        <Input
          label="Data e Hora Efetiva de Chegada *"
          type="datetime-local"
          value={dataChegada}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDataChegada(e.target.value)}
          required
        />

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Confirmar Chegada e Concluir</Button>
        </div>
      </form>
    </Modal>
  );
}
