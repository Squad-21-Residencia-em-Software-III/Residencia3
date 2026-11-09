import { useState, useMemo, useEffect } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import type { NovoAbastecimentoInput } from '../../types/abastecimento';
import type { Veiculo } from '../../types/veiculo';
import type { Motorista } from '../../types/motorista';
import { veiculosApi } from '../../services/api/veiculosApi';
import { motoristasApi } from '../../services/api/motoristasApi';
import { mensagemDeErro } from '../../services/api/http';

interface ModalAbastecimentoProps {
  onClose: () => void;
  onSalvar: (abastecimento: NovoAbastecimentoInput) => Promise<void> | void;
  veiculoIdInicial?: string;
}

export function ModalAbastecimento({
  onClose,
  onSalvar,
  veiculoIdInicial,
}: ModalAbastecimentoProps) {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [veiculoId, setVeiculoId] = useState<string>(veiculoIdInicial || '');
  const [motoristaId, setMotoristaId] = useState<string>('');
  const [dataAbastecimento, setDataAbastecimento] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [quilometragem, setQuilometragem] = useState<string>('');
  const [postoCombustivel, setPostoCombustivel] = useState<string>('');
  const [litros, setLitros] = useState<string>('');
  const [valorLitro, setValorLitro] = useState<string>('');
  const [erro, setErro] = useState<string>('');

  useEffect(() => {
    let ativo = true;
    Promise.all([veiculosApi.listar(), motoristasApi.listar()])
      .then(([listaV, listaM]) => {
        if (!ativo) return;
        setVeiculos(listaV);
        setMotoristas(listaM);
        if (!veiculoId && listaV.length > 0) {
          setVeiculoId(String(listaV[0].id));
        }
        if (!motoristaId && listaM.length > 0) {
          setMotoristaId(String(listaM[0].id));
        }
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [veiculoId, motoristaId]);

  // Total calculado dinamicamente
  const valorTotalCalculado = useMemo(() => {
    const l = parseFloat(litros.replace(',', '.'));
    const vl = parseFloat(valorLitro.replace(',', '.'));
    if (!isNaN(l) && !isNaN(vl) && l > 0 && vl > 0) {
      return (l * vl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return null;
  }, [litros, valorLitro]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    const vId = Number(veiculoId);
    const mId = Number(motoristaId);
    const km = Number(quilometragem);
    const l = parseFloat(litros.replace(',', '.'));
    const vl = parseFloat(valorLitro.replace(',', '.'));

    if (!vId) {
      setErro('Selecione um veículo.');
      return;
    }
    if (!mId) {
      setErro('Selecione um motorista.');
      return;
    }
    if (!dataAbastecimento) {
      setErro('Informe a data do abastecimento.');
      return;
    }
    if (isNaN(km) || km < 0) {
      setErro('Informe uma quilometragem válida.');
      return;
    }
    if (isNaN(l) || l <= 0) {
      setErro('Informe a quantidade de litros abastecida.');
      return;
    }
    if (isNaN(vl) || vl <= 0) {
      setErro('Informe o valor por litro.');
      return;
    }
    if (!postoCombustivel.trim()) {
      setErro('Informe o posto onde o veículo foi abastecido.');
      return;
    }

    const valorTotal = Number((l * vl).toFixed(2));

    try {
      setSalvando(true);
      await onSalvar({
        veiculo_id: vId,
        motorista_id: mId,
        fornecedor_id: null,
        data_abastecimento: dataAbastecimento,
        quilometragem: km,
        litros: l,
        valor_total: valorTotal,
        posto_combustivel: postoCombustivel.trim(),
      });
      onClose();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal title="Registrar Abastecimento" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Veículo *"
            value={veiculoId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setVeiculoId(e.target.value)}
            required
          >
            <option value="">Selecione o veículo</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa} — {v.modelo}
              </option>
            ))}
          </Select>

          <Select
            label="Motorista *"
            value={motoristaId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setMotoristaId(e.target.value)}
            required
          >
            <option value="">Selecione o motorista</option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Data *"
            type="date"
            value={dataAbastecimento}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDataAbastecimento(e.target.value)}
            required
          />

          <Input
            label="Hodômetro (KM) *"
            type="number"
            min="0"
            value={quilometragem}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuilometragem(e.target.value)}
            placeholder="Ex: 45200"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Litros *"
            type="text"
            value={litros}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setLitros(e.target.value)}
            placeholder="Ex: 45,5"
            required
          />

          <Input
            label="Valor por Litro (R$) *"
            type="text"
            value={valorLitro}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setValorLitro(e.target.value)}
            placeholder="Ex: 6,19"
            required
          />
        </div>

        <Input
          label="Posto de Combustível *"
          value={postoCombustivel}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPostoCombustivel(e.target.value)}
          placeholder="Ex: Posto BR Petrobras - Av. Beira Mar"
          required
        />

        {valorTotalCalculado && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-right text-xs text-slate-600">
            Total Estimado: <strong className="text-sm font-semibold text-slate-800">{valorTotalCalculado}</strong>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Abastecimento'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
