import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import type { NovoVeiculoInput, TipoFrota } from '../../types/veiculo';

interface ModalVeiculoProps {
  onClose: () => void;
  onSalvar: (veiculo: NovoVeiculoInput) => Promise<void>;
}

export function ModalVeiculo({ onClose, onSalvar }: ModalVeiculoProps) {
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  const [tipoFrota, setTipoFrota] = useState<TipoFrota>('ADMINISTRATIVA');
  const [capacidade, setCapacidade] = useState('4');
  const [kmAtual, setKmAtual] = useState('0');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
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

    const kmAtualNum = Number(kmAtual);
    if (!kmAtual || !Number.isInteger(kmAtualNum) || kmAtualNum < 0) {
      setErro('A quilometragem deve ser um número inteiro maior ou igual a 0.');
      return;
    }

    setSalvando(true);
    try {
      await onSalvar({
        placa: placa.trim().toUpperCase(),
        modelo: modelo.trim(),
        tipo_frota: tipoFrota,
        capacidade_maxima: capacidadeNum,
        km_atual: kmAtualNum,
      });
      onClose();
    } catch (error) {
      setErro(mensagemDeErro(error));
      setSalvando(false);
    }
  };

  return (
    <Modal title="Cadastrar Veículo" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Tipo de Frota"
            value={tipoFrota}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setTipoFrota(e.target.value as TipoFrota)
            }
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

        <Input
          label="Quilometragem Atual *"
          type="number"
          min="0"
          step="1"
          value={kmAtual}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmAtual(e.target.value)}
        />

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Cadastrando...' : 'Cadastrar Veículo'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
