import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal, Select } from '../../components/ui';
import type { TipoFrota, Veiculo } from '../../types/veiculo';

interface ModalVeiculoProps {
  onClose: () => void;
  onSalvar: (veiculo: Omit<Veiculo, 'id'>) => void;
}

export function ModalVeiculo({ onClose, onSalvar }: ModalVeiculoProps) {
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  const [tipoFrota, setTipoFrota] = useState<TipoFrota>('ADMINISTRATIVA');
  const [capacidade, setCapacidade] = useState('4');
  const [erro, setErro] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const capacidadeNum = Number(capacidade);
    if (!placa.trim() || !modelo.trim()) {
      setErro('Preencha a placa e o modelo.');
      return;
    }
    if (!Number.isInteger(capacidadeNum) || capacidadeNum < 0) {
      setErro('A capacidade deve ser um número inteiro maior ou igual a 0.');
      return;
    }
    if (capacidadeNum > 20) {
      setErro('A capacidade máxima permitida por veículo é de 20 pessoas.');
      return;
    }

    onSalvar({
      placa: placa.trim().toUpperCase(),
      modelo: modelo.trim(),
      tipo_frota: tipoFrota,
      capacidade_maxima: capacidadeNum,
      status: 'DISPONIVEL', // padrão do banco
    });

    onClose();
  };

  return (
    <Modal title="Cadastrar Veículo" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {erro && (
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>{erro}</p>
        )}

        <Input
          label="Placa *"
          placeholder="Ex: ABC1D23"
          value={placa}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPlaca(e.target.value.toUpperCase())}
          maxLength={7}
          required
        />

        <Input
          label="Modelo *"
          placeholder="Ex: Fiat Mobi"
          value={modelo}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setModelo(e.target.value)}
          maxLength={100}
          required
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Select
            label="Tipo de Frota"
            value={tipoFrota}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setTipoFrota(e.target.value as TipoFrota)}
          >
            <option value="ADMINISTRATIVA">Administrativa</option>
            <option value="SVO">SVO</option>
          </Select>

          <Input
            label="Capacidade Máxima"
            type="number"
            min="0"
            max="20"
            step="1"
            value={capacidade}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const val = e.target.value;
              if (val.length <= 2) {
                setCapacidade(val);
              }
            }}
          />
        </div>

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Cadastrar Veículo</Button>
        </div>
      </form>
    </Modal>
  );
}
