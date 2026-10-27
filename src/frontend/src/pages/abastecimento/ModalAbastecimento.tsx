import { useState, useMemo } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal, Select } from '../../components/ui';
import { storageService } from '../../services/storageService';
import type { NovoAbastecimentoInput } from '../../types/abastecimento';

interface ModalAbastecimentoProps {
  onClose: () => void;
  onSalvar: (abastecimento: NovoAbastecimentoInput) => void;
}

export function ModalAbastecimento({ onClose, onSalvar }: ModalAbastecimentoProps) {
  const veiculos = useMemo(() => storageService.getVeiculos(), []);
  const motoristas = useMemo(() => storageService.getMotoristas(), []);

  const [veiculoId, setVeiculoId] = useState<string>(veiculos[0]?.id ? String(veiculos[0].id) : '');
  const [motoristaId, setMotoristaId] = useState<string>(motoristas[0]?.id ? String(motoristas[0].id) : '');
  const [dataAbastecimento, setDataAbastecimento] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [quilometragem, setQuilometragem] = useState<string>('');
  const [postoCombustivel, setPostoCombustivel] = useState<string>('');
  const [litros, setLitros] = useState<string>('');
  const [valorLitro, setValorLitro] = useState<string>('');
  const [erro, setErro] = useState<string>('');

  // Total calculado dinamicamente
  const valorTotalCalculado = useMemo(() => {
    const l = parseFloat(litros.replace(',', '.'));
    const vl = parseFloat(valorLitro.replace(',', '.'));
    if (!isNaN(l) && !isNaN(vl) && l > 0 && vl > 0) {
      return (l * vl).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return null;
  }, [litros, valorLitro]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

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
    if (!km || km <= 0) {
      setErro('Informe uma quilometragem válida maior que zero.');
      return;
    }
    if (!l || l <= 0) {
      setErro('Informe a quantidade de litros abastecida.');
      return;
    }
    if (!vl || vl <= 0) {
      setErro('Informe o valor por litro.');
      return;
    }

    const valorTotal = Number((l * vl).toFixed(2));

    onSalvar({
      veiculo_id: vId,
      motorista_id: mId,
      fornecedor_id: null,
      data_abastecimento: dataAbastecimento,
      quilometragem: km,
      litros: l,
      valor_total: valorTotal,
      posto_combustivel: postoCombustivel.trim() || undefined,
    });

    onClose();
  };

  return (
    <Modal title="Registrar Abastecimento" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>
            {erro}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Data *"
            type="date"
            value={dataAbastecimento}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDataAbastecimento(e.target.value)}
            required
          />

          <Input
            label="Quilometragem (km) *"
            type="number"
            min="1"
            placeholder="Ex: 48620"
            value={quilometragem}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuilometragem(e.target.value)}
            required
          />
        </div>

        <Input
          label="Posto de Combustível"
          placeholder="Ex: Posto Avenida"
          value={postoCombustivel}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPostoCombustivel(e.target.value)}
          maxLength={150}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Litros *"
            type="number"
            step="0.01"
            min="0.1"
            placeholder="Ex: 52.4"
            value={litros}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setLitros(e.target.value)}
            required
          />

          <Input
            label="Valor por Litro (R$) *"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Ex: 5.89"
            value={valorLitro}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setValorLitro(e.target.value)}
            required
          />
        </div>

        {valorTotalCalculado && (
          <div
            style={{
              background: 'var(--color-bg-secondary, #F8FAFC)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md, 10px)',
              border: '1px solid var(--color-border, #E2E8F0)',
              marginBottom: '8px',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)', fontWeight: 600 }}>
              VALOR TOTAL DO ABASTECIMENTO (GRAVADO NO BANCO)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary, #1554B8)' }}>
              {valorTotalCalculado}
            </div>
          </div>
        )}

        <div className="modal__footer" style={{ borderTop: 'none', padding: '16px 0 0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Registrar Abastecimento</Button>
        </div>
      </form>
    </Modal>
  );
}
