import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EquipeSvo } from '../../types/equipeSvo';
import { SeletorEquipeSvo } from './SeletorEquipeSvo';

const equipes: EquipeSvo[] = [
  { id: 1, nome_equipe: 'Equipe Plantão SVO - A' },
  { id: 2, nome_equipe: 'Equipe Plantão SVO - B' },
];

const props = { equipes, carregando: false, erro: null, valor: '', onChange: () => {} };

describe('SeletorEquipeSvo', () => {
  it('lista a opção sem equipe e as equipes disponíveis', () => {
    render(<SeletorEquipeSvo {...props} />);

    expect(screen.getByRole('option', { name: 'Sem equipe definida' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Equipe Plantão SVO - A' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Equipe Plantão SVO - B' })).toBeEnabled();
    expect(screen.getByText('2 equipe(s) disponível(is).')).toBeInTheDocument();
  });

  it('avisa quando nenhuma equipe está disponível e mantém a opção sem equipe', () => {
    render(<SeletorEquipeSvo {...props} equipes={[]} />);

    expect(screen.getByText(/Nenhuma equipe disponível no período/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sem equipe definida' })).toBeInTheDocument();
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
    render(<SeletorEquipeSvo {...props} erro="Erro interno do servidor" />);

    expect(
      screen.getByText(/Não foi possível carregar as equipes disponíveis: Erro interno do servidor/),
    ).toBeInTheDocument();
    expect(screen.getByText(/alocar a ordem sem equipe/)).toBeInTheDocument();
  });
});
