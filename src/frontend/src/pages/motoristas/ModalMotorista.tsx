import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal, Select } from '../../components/ui';
import type { Motorista, TipoMotorista } from '../../types/motorista';

const CATEGORIAS_CNH = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'];

interface ModalMotoristaProps {
  cnhsExistentes: string[];
  onClose: () => void;
  onSalvar: (motorista: Omit<Motorista, 'id' | 'usuario_id'>) => void;
}

export function ModalMotorista({ cnhsExistentes, onClose, onSalvar }: ModalMotoristaProps) {
  const [nome, setNome] = useState('');
  const [numeroCnh, setNumeroCnh] = useState('');
  const [categoria, setCategoria] = useState('B');
  const [validade, setValidade] = useState('');
  const [tipo, setTipo] = useState<TipoMotorista>('FROTA');
  const [erro, setErro] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!nome.trim() || !numeroCnh.trim() || !validade) {
      setErro('Preencha nome, número da CNH e validade.');
      return;
    }
    if (cnhsExistentes.includes(numeroCnh.trim())) {
      setErro('Já existe um motorista com este número de CNH.');
      return;
    }

    onSalvar({
      nome: nome.trim(),
      numero_cnh: numeroCnh.trim(),
      categoria_cnh: categoria,
      validade_cnh: validade,
      tipo_motorista: tipo,
      status: 'DISPONIVEL', // padrão do banco
    });

    onClose();
  };

  return (
    <Modal title="Cadastrar Motorista" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {erro && (
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>{erro}</p>
        )}

        {/* No banco, o nome vem do usuário vinculado (usuario_id). No mock, é digitado. */}
        <Input
          label="Nome (usuário vinculado) *"
          placeholder="Ex: João Santos"
          value={nome}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNome(e.target.value)}
          maxLength={255}
          required
        />

        <Input
          label="Número da CNH *"
          placeholder="Ex: 10000000001"
          value={numeroCnh}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNumeroCnh(e.target.value)}
          maxLength={20}
          required
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Select
            label="Categoria da CNH"
            value={categoria}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoria(e.target.value)}
          >
            {CATEGORIAS_CNH.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Input
            label="Validade da CNH *"
            type="date"
            value={validade}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setValidade(e.target.value)}
            required
          />
        </div>

        <Select
          label="Tipo de Motorista"
          value={tipo}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setTipo(e.target.value as TipoMotorista)}
        >
          <option value="FROTA">Frota</option>
          <option value="SVO">SVO</option>
        </Select>

        <div className="modal__footer" style={{ borderTop: 'none', padding: 0 }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Cadastrar Motorista</Button>
        </div>
      </form>
    </Modal>
  );
}
