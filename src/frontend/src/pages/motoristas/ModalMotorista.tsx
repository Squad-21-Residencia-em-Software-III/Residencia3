import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Input, Modal, Select } from '../../components/ui';
import type { TipoMotorista, Motorista } from '../../types/motorista';

interface ModalMotoristaProps {
  cnhsExistentes: string[];
  onClose: () => void;
  onSalvar: (motorista: Omit<Motorista, 'id' | 'usuario_id'>) => void;
}

export function ModalMotorista({
  cnhsExistentes,
  onClose,
  onSalvar,
}: ModalMotoristaProps) {
  const [nome, setNome] = useState('');
  const [cnh, setCnh] = useState('');
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [validade, setValidade] = useState('');
  const [tipo, setTipo] = useState<TipoMotorista>('FROTA');
  const [erro, setErro] = useState('');

  const categoriasDisponiveis = ['A', 'B', 'C', 'D', 'E'];

  const handleCategoriaChange = (cat: string) => {
    setCategoriasSelecionadas(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : [...prev, cat].sort()
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!nome.trim()) {
      setErro('O nome completo é obrigatório.');
      return;
    }

    if (!cnh.trim()) {
      setErro('O número da CNH é obrigatório.');
      return;
    }

    if (cnh.trim().length !== 11) {
      setErro('A CNH deve conter exatamente 11 números.');
      return;
    }

    if (categoriasSelecionadas.length === 0) {
      setErro('Selecione ao menos uma categoria de CNH.');
      return;
    }

    if (!validade.trim()) {
      setErro('A data de validade da CNH é obrigatória.');
      return;
    }

    const cnhTrim = cnh.trim().toUpperCase();
    if (cnhsExistentes.some((existingCnh) => existingCnh.toUpperCase() === cnhTrim)) {
      setErro('Esta CNH já está cadastrada para outro motorista.');
      return;
    }

    onSalvar({
      nome: nome.trim(),
      numero_cnh: cnhTrim,
      categoria_cnh: categoriasSelecionadas.join(''),
      validade_cnh: validade,
      tipo_motorista: tipo,
    });

    onClose();
  };

  return (
    <Modal title="Cadastrar Motorista" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {erro && (
          <p style={{ color: 'var(--color-danger)', fontSize: '13px', margin: '0 0 16px' }}>{erro}</p>
        )}

        <Input
          label="Nome Completo *"
          placeholder="Ex: João Silva"
          value={nome}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNome(e.target.value)}
          required
        />

        <Input
          label="Número da CNH *"
          placeholder="Apenas números"
          value={cnh}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setCnh(e.target.value)}
          maxLength={11}
          required
        />

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-text)',
            marginBottom: '8px'
          }}>
            Categoria da CNH *
          </label>
          <div style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            padding: '8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)'
          }}>
            {categoriasDisponiveis.map(cat => (
              <label key={cat} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: categoriasSelecionadas.includes(cat) ? 'var(--color-primary-soft)' : 'transparent',
                border: categoriasSelecionadas.includes(cat) ? '1px solid var(--color-primary)' : '1px solid transparent',
                transition: 'all 0.2s ease'
              }}>
                <input
                  type="checkbox"
                  checked={categoriasSelecionadas.includes(cat)}
                  onChange={() => handleCategoriaChange(cat)}
                  style={{ cursor: 'pointer' }}
                />
                {cat}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '16px' }}>
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
          <option value="FROTA">Frota Administrativa</option>
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
