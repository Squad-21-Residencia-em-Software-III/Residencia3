import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OcupacaoVeiculoSvo } from '../../types/veiculo';
import { motivoBloqueioSvo, OcupacaoVeiculoSvoPainel } from './OcupacaoVeiculoSvo';

const base: OcupacaoVeiculoSvo = {
  id: 1,
  placa: 'SVO1234',
  modelo: 'Furgão SVO',
  capacidade_maxima: 4,
  status: 'DISPONIVEL',
  capacidade_utilizada: 1,
  vagas_disponiveis: 3,
};

describe('OcupacaoVeiculoSvoPainel', () => {
  it('mostra a ocupação atual sem bloqueio quando há vagas', () => {
    render(<OcupacaoVeiculoSvoPainel veiculo={base} />);

    expect(screen.getByText('1/4 vagas ocupadas')).toBeInTheDocument();
    expect(screen.queryByText(/Alocação bloqueada/i)).not.toBeInTheDocument();
  });

  it('explica o bloqueio quando o veículo está lotado', () => {
    const lotado = { ...base, capacidade_utilizada: 4, vagas_disponiveis: 0 };
    render(<OcupacaoVeiculoSvoPainel veiculo={lotado} />);

    expect(screen.getByText(/Alocação bloqueada/i)).toBeInTheDocument();
    expect(screen.getByText(/Veículo lotado: 4 de 4 vagas ocupadas/i)).toBeInTheDocument();
  });
});

describe('motivoBloqueioSvo', () => {
  it('bloqueia veículo em manutenção mesmo com vagas', () => {
    expect(motivoBloqueioSvo({ ...base, status: 'MANUTENCAO' })).toMatch(/manutenção/i);
  });

  it('bloqueia veículo em deslocamento mesmo com vagas', () => {
    expect(motivoBloqueioSvo({ ...base, status: 'EM_USO' })).toMatch(/deslocamento/i);
  });

  it('libera quando há vaga e o veículo não está em manutenção', () => {
    expect(motivoBloqueioSvo(base)).toBeNull();
  });
});
