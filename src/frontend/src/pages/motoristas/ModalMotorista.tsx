import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import type { TipoMotorista, Motorista } from '../../types/motorista';
import { cn } from '../../utils/cn';

interface ModalMotoristaProps {
  cnhsExistentes: string[];
  onClose: () => void;
  onSalvar: (motorista: Omit<Motorista, 'id' | 'usuario_id'>) => void;
}

export function ModalMotorista({ cnhsExistentes, onClose, onSalvar }: ModalMotoristaProps) {
  const [nome, setNome] = useState('');
  const [cnh, setCnh] = useState('');
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<string[]>([]);
  const [validade, setValidade] = useState('');
  const [tipo, setTipo] = useState<TipoMotorista>('FROTA');
  const [erro, setErro] = useState('');

  const categoriasDisponiveis = ['A', 'B', 'C', 'D', 'E'];

  const handleCategoriaChange = (cat: string) => {
    setCategoriasSelecionadas((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat].sort(),
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
      status: 'DISPONIVEL',
    });

    onClose();
  };

  return (
    <Modal title="Cadastrar Motorista" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
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

        <div className="mb-4">
          <label className="mb-2 block text-[13px] font-semibold text-slate-900">
            Categoria da CNH *
          </label>
          <div className="flex flex-wrap gap-2.5 rounded-md border border-slate-200 bg-white p-2">
            {categoriasDisponiveis.map((cat) => {
              const selecionada = categoriasSelecionadas.includes(cat);
              return (
                <label
                  key={cat}
                  className={cn(
                    'flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[13px] transition-all duration-200',
                    selecionada
                      ? 'border-primary bg-primary-soft font-semibold text-primary'
                      : 'border-transparent bg-transparent text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selecionada}
                    onChange={() => handleCategoriaChange(cat)}
                    className="cursor-pointer"
                  />
                  {cat}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3">
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

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Cadastrar Motorista</Button>
        </div>
      </form>
    </Modal>
  );
}
