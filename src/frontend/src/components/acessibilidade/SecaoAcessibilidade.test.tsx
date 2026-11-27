import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcessibilidadeProvider } from '../../contexts/AcessibilidadeContext';
import { chaveDe, PREFERENCIAS_PADRAO, salvarPreferencias } from '../../utils/preferenciasAcessibilidade';
import { SecaoAcessibilidade } from './SecaoAcessibilidade';

const sessao = vi.hoisted(() => ({ usuario: null as { id: number } | null, carregando: false }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => sessao }));

const html = document.documentElement;

function renderizar() {
  return render(
    <AcessibilidadeProvider>
      <SecaoAcessibilidade />
    </AcessibilidadeProvider>,
  );
}

const grupo = (nome: string) => screen.getByRole('group', { name: nome });

beforeEach(() => {
  sessao.usuario = null;
  sessao.carregando = false;
});

afterEach(() => {
  localStorage.clear();
  html.removeAttribute('style');
  delete html.dataset.contraste;
  delete html.dataset.movimento;
  delete html.dataset.paleta;
});

describe('SecaoAcessibilidade (SCRUM-305 e SCRUM-307)', () => {
  it('agrupa as opções com rótulos que o leitor de tela anuncia', () => {
    renderizar();
    expect(screen.getByRole('region', { name: 'Acessibilidade' })).toBeInTheDocument();
    expect(within(grupo('Tamanho do texto')).getAllByRole('radio')).toHaveLength(5);
    expect(within(grupo('Contraste')).getByRole('radio', { name: 'Alto contraste' })).toHaveAccessibleDescription(
      'Textos e bordas mais escuros e foco reforçado',
    );
    expect(within(grupo('Animações')).getByRole('radio', { name: /Seguir o aparelho/ })).toBeChecked();
    expect(within(grupo('Cores para daltonismo')).getAllByRole('radio')).toHaveLength(4);
  });

  it('aplica na hora e salva para a conta', async () => {
    sessao.usuario = { id: 5 };
    const user = userEvent.setup();
    renderizar();

    await user.click(within(grupo('Tamanho do texto')).getByRole('radio', { name: /Muito grande/ }));
    await user.click(within(grupo('Contraste')).getByRole('radio', { name: /Alto contraste/ }));
    await user.click(within(grupo('Animações')).getByRole('radio', { name: /Reduzir animações/ }));
    await user.click(within(grupo('Cores para daltonismo')).getByRole('radio', { name: /Tritanopia/ }));

    expect(html.style.getPropertyValue('--escala-texto')).toBe('1.5');
    expect(html.dataset).toMatchObject({ contraste: 'alto', movimento: 'reduzido', paleta: 'tritanopia' });
    expect(JSON.parse(localStorage.getItem(chaveDe(5))!).prefs).toEqual({
      escalaTexto: 1.5,
      contraste: 'alto',
      movimento: 'reduzido',
      paleta: 'tritanopia',
    });
    expect(localStorage.getItem(chaveDe(null))).toBeNull();
  });

  it('funciona só com teclado', async () => {
    const user = userEvent.setup();
    renderizar();
    const padrao = within(grupo('Contraste')).getByRole('radio', { name: 'Padrão' });
    padrao.focus();
    await user.keyboard('{ArrowDown}');
    expect(within(grupo('Contraste')).getByRole('radio', { name: /Alto contraste/ })).toBeChecked();
    expect(html.dataset.contraste).toBe('alto');
  });

  it('restaura tudo ao padrão e avisa o leitor de tela', async () => {
    salvarPreferencias(null, { escalaTexto: 1.25, contraste: 'alto', movimento: 'reduzido', paleta: 'protanopia' });
    const user = userEvent.setup();
    renderizar();

    await user.click(screen.getByRole('button', { name: 'Restaurar padrões' }));

    expect(html.dataset).toMatchObject({ contraste: 'padrao', movimento: 'sistema', paleta: 'padrao' });
    expect(html.style.getPropertyValue('--escala-texto')).toBe('1');
    expect(screen.getByRole('status')).toHaveTextContent('Preferências de acessibilidade restauradas.');
    expect(screen.getByRole('button', { name: 'Restaurar padrões' })).toBeDisabled();
  });

  it('trocar de conta não leva as preferências da conta anterior', async () => {
    salvarPreferencias(1, { ...PREFERENCIAS_PADRAO, paleta: 'deuteranopia' });
    sessao.usuario = { id: 1 };
    const { rerender } = renderizar();
    expect(html.dataset.paleta).toBe('deuteranopia');

    sessao.usuario = { id: 2 };
    await act(async () => {
      rerender(
        <AcessibilidadeProvider>
          <SecaoAcessibilidade />
        </AcessibilidadeProvider>,
      );
    });
    expect(html.dataset.paleta).toBe('padrao');

    sessao.usuario = null;
    await act(async () => {
      rerender(
        <AcessibilidadeProvider>
          <SecaoAcessibilidade />
        </AcessibilidadeProvider>,
      );
    });
    expect(html.dataset.paleta).toBe('padrao');
  });

  it('acompanha a mudança feita em outra aba da mesma conta', async () => {
    renderizar();
    salvarPreferencias(null, { ...PREFERENCIAS_PADRAO, contraste: 'alto' });
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: chaveDe(null) }));
    });
    expect(html.dataset.contraste).toBe('alto');
    expect(within(grupo('Contraste')).getByRole('radio', { name: /Alto contraste/ })).toBeChecked();
  });

  it('mostra um exemplo dos status com as cores escolhidas', () => {
    renderizar();
    const exemplo = screen.getByRole('group', { name: 'Exemplo de status com as cores escolhidas' });
    expect(within(exemplo).getByText('Aprovada')).toBeInTheDocument();
    expect(within(exemplo).getByText('Recusada')).toBeInTheDocument();
  });
});
