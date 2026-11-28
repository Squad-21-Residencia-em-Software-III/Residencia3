import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AgendaSemana } from './AgendaSemana';
import type { LinhaRecursoAgenda } from '../../types/agenda';
import type { StatusViagem, Viagem } from '../../types/viagem';

// SCRUM-307 e SCRUM-306: o status na agenda não depende só da cor.

const STATUS: StatusViagem[] = ['AGENDADA', 'EM_ANDAMENTO', 'NO_LOCAL', 'CONCLUIDA', 'CANCELADA'];

function linha(): LinhaRecursoAgenda {
  return {
    id: 1,
    modelo: 'Spin',
    placa: 'ABC1D23',
    blocos: STATUS.map((status, i) => ({
      chave: `ADMINISTRATIVA-${i + 1}`,
      data: '2026-11-30',
      viagem: { id: i + 1, status, tipo_operacao: 'ADMINISTRATIVA', origem: 'Sede', destino: 'HEMOSE' } as unknown as Viagem,
      inicioMin: 60 * (i + 1),
      fimMin: 60 * (i + 2),
      horaInicioLabel: `0${i + 1}:00`,
      horaFimLabel: `0${i + 2}:00`,
      semPrevisaoFim: false,
    })),
  };
}

describe('agenda da semana', () => {
  it('cada barra diz o status no nome acessível', () => {
    render(
      <AgendaSemana
        linhas={[linha()]}
        diasSemana={[{ data: '2026-11-30', label: 'Seg', diaNumero: 30, ehHoje: false }]}
        onSelecionarViagem={vi.fn()}
      />,
    );
    for (const rotulo of ['Agendada', 'Em Andamento', 'No local', 'Concluída', 'Cancelada']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${rotulo} · `) })).toBeInTheDocument();
    }
  });

  it('a legenda mostra os cinco status, com o mesmo marcador das barras', () => {
    render(
      <AgendaSemana
        linhas={[linha()]}
        diasSemana={[{ data: '2026-11-30', label: 'Seg', diaNumero: 30, ehHoje: false }]}
        onSelecionarViagem={vi.fn()}
      />,
    );
    const legenda = screen.getByRole('list', { name: 'Legenda dos status' });
    expect(within(legenda).getAllByRole('listitem')).toHaveLength(5);
    const barra = screen.getByRole('button', { name: /^Agendada · / });
    const amostra = within(legenda).getByText('Agendada').previousElementSibling;
    expect(barra.className).toContain('border-dashed');
    expect(amostra?.className).toContain('border-dashed');
  });
});
