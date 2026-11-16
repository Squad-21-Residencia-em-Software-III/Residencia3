import { useState, useEffect } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import { recursoAtivo } from '../../config/recursosBackend';
import { mensagemDeErro } from '../../services/api/http';
import type { NovoVeiculoInput, TipoFrota, Veiculo } from '../../types/veiculo';

interface ModalVeiculoProps {
  onClose: () => void;
  onSalvar: (veiculo: NovoVeiculoInput) => Promise<void>;
  veiculoParaEditar?: Veiculo | null;
  /** Fixa a frota (cada gestor só cadastra veículos da própria frota). */
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
  // Lotação da cabine SVO (motorista incluído): coluna nova da SCRUM-175/181
  const [cabine, setCabine] = useState(
    veiculoParaEditar?.lotacao_cabine != null ? String(veiculoParaEditar.lotacao_cabine) : '',
  );
  const isSvo = tipoFrota === 'SVO';
  const comCabine = isSvo && recursoAtivo('lotacaoCabine');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (veiculoParaEditar) {
      setPlaca(veiculoParaEditar.placa);
      setModelo(veiculoParaEditar.modelo);
      setTipoFrota(veiculoParaEditar.tipo_frota);
      setCapacidade(String(veiculoParaEditar.capacidade_maxima));
      setKmAtual(String(veiculoParaEditar.km_atual));
      setCabine(
        veiculoParaEditar.lotacao_cabine != null ? String(veiculoParaEditar.lotacao_cabine) : '',
      );
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
    if (isSvo && capacidadeNum > 4) {
      setErro('Veículos da frota SVO podem ter capacidade máxima de até 4.');
      return;
    }

    const cabineNum = Number(cabine);
    if (comCabine && (!cabine || !Number.isInteger(cabineNum) || cabineNum < 1)) {
      setErro('Informe a lotação da cabine: número inteiro de pessoas, contando o motorista.');
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
        // Corpos e cabine são medidas diferentes e vão em campos separados
        ...(comCabine ? { lotacao_cabine: cabineNum } : {}),
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
            label={isSvo ? 'Capacidade Máxima de corpos * (1 a 4)' : 'Capacidade Máxima de passageiros *'}
            type="number"
            min="1"
            max={isSvo ? '4' : '20'}
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

        {comCabine && (
          <Input
            label="Lotação da cabine * (pessoas, contando o motorista)"
            type="number"
            min="1"
            step="1"
            value={cabine}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.value.length <= 2) setCabine(e.target.value);
            }}
          />
        )}

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
