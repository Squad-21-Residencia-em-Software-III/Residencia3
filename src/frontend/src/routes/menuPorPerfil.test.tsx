import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppRoutes } from './index';
import { useAuth } from '../contexts/AuthContext';
import { PERFIS } from '../types/usuario';
import type { Perfil, Usuario } from '../types/usuario';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));

function logarComo(perfil: Perfil) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, nome: 'Usuário Teste', email: 'teste@exemplo.com', perfil } as Usuario,
    carregando: false,
    login: vi.fn(),
    logout: vi.fn(),
    temPerfil: (...perfis: Perfil[]) => perfis.includes(perfil),
  });
}

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

/** Item do menu → rota da tela. */
const TELAS = {
  Início: '/inicio',
  Solicitações: '/solicitacoes',
  'Triagem SVO': '/triagem-svo',
  Viagens: '/viagens',
  Agenda: '/agenda',
  Veículos: '/veiculos',
  Abastecimento: '/abastecimento',
  Manutenções: '/manutencoes',
  Infrações: '/multas',
  Equipe: '/equipe',
  Auditoria: '/auditoria',
} as const;

type Tela = keyof typeof TELAS;
const TODAS = Object.keys(TELAS) as Tela[];

// Documento "Permissões e acesso a telas do sistema" + regras confirmadas com o líder
const MENU_POR_PERFIL: Record<Perfil, Tela[]> = {
  [PERFIS.ADMINISTRADOR]: TODAS,
  [PERFIS.GESTOR_FROTA]: [
    'Início',
    'Solicitações',
    'Viagens',
    'Agenda',
    'Veículos',
    'Abastecimento',
    'Manutenções',
    'Infrações',
    'Equipe',
  ],
  [PERFIS.GESTOR_SVO]: [
    'Início',
    'Solicitações',
    'Triagem SVO',
    'Viagens',
    'Agenda',
    'Veículos',
    'Abastecimento',
    'Manutenções',
    'Infrações',
    'Equipe',
  ],
  [PERFIS.SOLICITANTE]: ['Início', 'Solicitações', 'Veículos'],
  [PERFIS.MOTORISTA_FROTA]: ['Início', 'Viagens', 'Veículos', 'Abastecimento'],
  [PERFIS.MOTORISTA_SVO]: ['Início', 'Viagens', 'Veículos', 'Abastecimento'],
};

const PERFIS_TESTADOS = Object.keys(MENU_POR_PERFIL) as Perfil[];

describe('Menu por perfil', () => {
  it.each(PERFIS_TESTADOS)('%s vê exatamente as telas do seu perfil', (perfil) => {
    logarComo(perfil);
    abrir('/sobre');

    for (const tela of TODAS) {
      const visivel = screen.queryAllByRole('link', { name: tela }).length > 0;
      expect(visivel, `${perfil} → ${tela}`).toBe(MENU_POR_PERFIL[perfil].includes(tela));
    }
  });
});

describe('Telas bloqueadas pela URL', () => {
  const bloqueios = PERFIS_TESTADOS.flatMap((perfil) =>
    TODAS.filter((tela) => !MENU_POR_PERFIL[perfil].includes(tela)).map(
      (tela) => [perfil, tela] as const,
    ),
  );

  it.each(bloqueios)('%s abrindo %s vai para a página 403', (perfil, tela) => {
    logarComo(perfil);
    abrir(TELAS[tela]);

    expect(screen.getByRole('heading', { name: 'Acesso não autorizado' })).toBeInTheDocument();
  });
});
