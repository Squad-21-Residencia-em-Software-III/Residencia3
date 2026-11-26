import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';

function renderizar(rota = '/') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AppLayout navItems={[]} title="Início">
        <p>conteúdo</p>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe('AppLayout - cabeçalho', () => {
  it('exibe sino de notificações e engrenagem de preferências como controles independentes', () => {
    renderizar();
    expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /preferências e permissões do aplicativo/i }),
    ).toBeInTheDocument();
  });

  it('a engrenagem abre o modal de preferências sem abrir o dropdown do sino', async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole('button', { name: /preferências e permissões/i }));

    expect(screen.getByText('Preferências do Aplicativo')).toBeInTheDocument();
    expect(screen.queryByText(/não tem notificações/i)).not.toBeInTheDocument();
  });

  it('o sino abre o dropdown sem abrir o modal de preferências', async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));

    expect(screen.getByText(/não tem notificações/i)).toBeInTheDocument();
    expect(screen.queryByText('Preferências do Aplicativo')).not.toBeInTheDocument();
  });

  it('mostra "Sobre Nós" só na home, convivendo com sino e engrenagem', () => {
    const { unmount } = renderizar('/');
    expect(screen.getByRole('link', { name: 'Sobre Nós' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument();
    unmount();

    renderizar('/veiculos');
    expect(screen.queryByRole('link', { name: 'Sobre Nós' })).not.toBeInTheDocument();
  });
});
