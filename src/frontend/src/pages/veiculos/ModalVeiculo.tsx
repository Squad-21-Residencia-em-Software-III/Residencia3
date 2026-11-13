import { useState, useEffect } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import { mensagemDeErro } from '../../services/api/http';
import type { NovoVeiculoInput, TipoFrota, Veiculo } from '../../types/veiculo';

interface ModalVeiculoProps {
  onClose: () => void;
  onSalvar: (veiculo: NovoVeiculoInput) => Promise<void>;
  veiculoParaEditar?: Veiculo | null;
  /** Fixa a frota (ex.: o Gestor SVO só cadastra veículos da frota SVO). */
  apenasFrota?: TipoFrota;
}

export function ModalVeiculo({
  onClose,
  onSalvar,
  veiculoParaEditar,
  apenasFrota,
}: ModalVeiculoProps) {
  const [placa, setPlaca] = useState(veiculoParaEditar?.placa ?? '');
  const [modelo, setModelo] = useState(veiculoParaEditar?.modelo ?? '');
  const [tipoFrota, setTipoFrota] = useState<TipoFrota>(
    veiculoParaEditar?.tipo_frota ?? apenasFrota ?? 'ADMINISTRATIVA',
  );
  const [capacidade, setCapacidade] = useState(String(veiculoParaEditar?.capacidade_maxima ?? '4'));
  const [kmAtual, setKmAtual] = useState(String(veiculoParaEditar?.km_atual ?? '0'));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (veiculoParaEditar) {
      setPlaca(veiculoParaEditar.placa);
      setModelo(veiculoParaEditar.modelo);
      setTipoFrota(veiculoParaEditar.tipo_frota);
      setCapacidade(String(veiculoParaEditar.capacidade_maxima));
      setKmAtual(String(veiculoParaEditar.km_atual));
    }
  }, [veiculoParaEditar]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const capacidadeNum = Number(capacidade);
    if (!placa.trim() || !modelo.trim()) {
      setErro('Preencha a placa e o modelo.');
      return;
    }
    if (!Number.isInteger(capacidadeNum) || capacidadeNum < 1) {
      setErro('A capacidade deve ser um número inteiro de no mínimo 1 pessoa/óbito.');
      return;
    }
    if (tipoFrota === 'SVO' && capacidadeNum > 4) {
      setErro('Veículos da frota SVO podem ter capacidade máxima de até 4.');
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

  const isEdicao = Boolean(veiculoParaEditar);

  return (
    <Modal title={isEdicao ? `Editar Veículo — ${veiculoParaEditar?.placa}` : 'Cadastrar Veículo'} onClose={onClose}>
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
            disabled={Boolean(apenasFrota)}
            title={apenasFrota ? 'Seu perfil só gerencia veículos desta frota' : undefined}
          >
            <option value="ADMINISTRATIVA">Administrativa</option>
            <option value="SVO">SVO</option>
          </Select>

          <Input
            label="Capacidade Máxima *"
            type="number"
            min="1"
            max={tipoFrota === 'SVO' ? '4' : '20'}
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
            {salvando ? 'Salvando...' : isEdicao ? 'Salvar Alterações' : 'Cadastrar Veículo'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
