import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EquipeSvo } from '../../types/equipeSvo';
import { SeletorEquipeSvo } from './SeletorEquipeSvo';

const equipes: EquipeSvo[] = [
  { id: 1, nome_equipe: 'Equipe Plantão SVO - A', disponivel: true },
  { id: 2, nome_equipe: 'Equipe Plantão SVO - B', disponivel: false },
];

const props = { equipes, carregando: false, erro: null, valor: '', onChange: () => {} };

describe('SeletorEquipeSvo', () => {
  it('lista as equipes e marca a indisponível como desabilitada', () => {
    render(<SeletorEquipeSvo {...props} />);

    expect(screen.getByRole('option', { name: 'Sem equipe definida' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Equipe Plantão SVO - A' })).toBeEnabled();
    expect(screen.getByRole('option', { name: /Equipe Plantão SVO - B — indisponível/ })).toBeDisabled();
    expect(screen.getByText('1 equipe(s) disponível(is).')).toBeInTheDocument();
  });

  it('avisa quando nenhuma equipe está disponível', () => {
    const indisponiveis = equipes.map((e) => ({ ...e, disponivel: false }));
    render(<SeletorEquipeSvo {...props} equipes={indisponiveis} />);

    expect(screen.getByText(/Nenhuma equipe disponível no momento/)).toBeInTheDocument();
  });

  it('informa a escolha da equipe ao pai', async () => {
    const onChange = vi.fn();
    render(<SeletorEquipeSvo {...props} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Equipe SVO (opcional)'), '1');

    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('mostra o carregamento', () => {
    render(<SeletorEquipeSvo {...props} carregando />);

    expect(screen.getByTestId('equipes-carregando')).toBeInTheDocument();
    expect(screen.queryByLabelText('Equipe SVO (opcional)')).not.toBeInTheDocument();
  });

  it('explica a falha e deixa alocar sem equipe', () => {
    render(<SeletorEquipeSvo {...props} erro="Rota não encontrada" />);

    expect(screen.getByText(/Não foi possível carregar as equipes: Rota não encontrada/)).toBeInTheDocument();
    expect(screen.getByText(/alocar a ordem sem equipe/)).toBeInTheDocument();
  });
});
