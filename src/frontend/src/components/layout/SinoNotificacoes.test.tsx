import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SinoNotificacoes, rotuloBadge } from './SinoNotificacoes';
import type { NotificacaoItem } from './SinoNotificacoes';

function gerar(qtd: number): NotificacaoItem[] {
  return Array.from({ length: qtd }, (_, i) => ({ id: String(i), titulo: `Aviso ${i}` }));
}

describe('SinoNotificacoes', () => {
  it('formata o badge como 99+ acima de 99', () => {
    expect(rotuloBadge(5)).toBe('5');
    expect(rotuloBadge(99)).toBe('99');
    expect(rotuloBadge(100)).toBe('99+');
  });

  it('não mostra badge sem notificações não lidas', () => {
    render(<SinoNotificacoes />);
    expect(screen.queryByTestId('badge-notificacoes')).not.toBeInTheDocument();
  });

  it('mostra 99+ e rótulo acessível com muitas não lidas', () => {
    render(<SinoNotificacoes notificacoes={gerar(150)} />);
    expect(screen.getByTestId('badge-notificacoes')).toHaveTextContent('99+');
    expect(screen.getByRole('button', { name: /mais de 99 não lidas/i })).toBeInTheDocument();
  });

  it('abre o dropdown, mostra estado vazio e atualiza aria-expanded', async () => {
    const user = userEvent.setup();
    render(<SinoNotificacoes />);
    const sino = screen.getByRole('button', { name: 'Notificações' });
    expect(sino).toHaveAttribute('aria-expanded', 'false');

    await user.click(sino);
    expect(sino).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Notificações' })).toBeInTheDocument();
    expect(screen.getByText(/não tem notificações/i)).toBeInTheDocument();
  });

  it('fecha com Escape e devolve o foco ao sino', async () => {
    const user = userEvent.setup();
    render(<SinoNotificacoes notificacoes={gerar(2)} />);
    const sino = screen.getByRole('button', { name: /não lidas/i });
    await user.click(sino);
    expect(screen.getByText('Aviso 0')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sino).toHaveFocus();
  });

  it('fecha ao clicar fora', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SinoNotificacoes />
        <button type="button">Fora</button>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Fora' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
