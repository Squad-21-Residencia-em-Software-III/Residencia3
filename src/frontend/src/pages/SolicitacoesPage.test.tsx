import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SolicitacoesPage from './SolicitacoesPage';
import { solicitacoesApi } from '../services/api/solicitacoesApi';
import type { SolicitacaoViagem } from '../types/solicitacao';

const sessao = vi.hoisted(() => ({ perfil: 'SOLICITANTE' }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 2, nome: 'Carla Solicitante', perfil: sessao.perfil },
    temPerfil: (...perfis: string[]) => perfis.includes(sessao.perfil),
  }),
}));

vi.mock('../services/api/solicitacoesApi', () => ({
  solicitacoesApi: { listar: vi.fn(), listarMinhas: vi.fn(), criar: vi.fn() },
}));

const api = vi.mocked(solicitacoesApi);

const pendente: SolicitacaoViagem = {
  id: 9,
  solicitante_id: 2,
  solicitante_nome: 'Carla Solicitante',
  origem: 'Sede',
  destino: 'Hospital Regional',
  finalidade: 'Reunião',
  data_saida_desejada: '2026-11-20T08:00:00',
  status: 'PENDENTE_APROVACAO',
};

function abrir() {
  render(
    <MemoryRouter>
      <SolicitacoesPage />
    </MemoryRouter>,
  );
}

describe('SolicitacoesPage por perfil', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('Solicitante vê só as próprias solicitações e pode criar, sem analisar', async () => {
    sessao.perfil = 'SOLICITANTE';
    // GET /minhas não traz o nome do solicitante: a tela usa o do usuário logado
    api.listarMinhas.mockResolvedValue([{ ...pendente, solicitante_nome: undefined as never }]);

    abrir();

    expect(await screen.findByText('Hospital Regional')).toBeInTheDocument();
    expect(api.listarMinhas).toHaveBeenCalled();
    expect(api.listar).not.toHaveBeenCalled();
    expect(screen.getByText('Minhas Solicitações de Viagem')).toBeInTheDocument();
    expect(screen.getAllByText('Carla Solicitante').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Nova Solicitação/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analisar' })).not.toBeInTheDocument();
  });

  it('Gestor SVO vê as solicitações e pode solicitar, mas não analisa a frota administrativa', async () => {
    sessao.perfil = 'GESTOR_SVO';
    api.listar.mockResolvedValue([pendente]);

    abrir();

    expect(await screen.findByText('Hospital Regional')).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Nova Solicitação/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analisar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Detalhes/ })).toBeInTheDocument();
  });

  it('Gestor de Frota analisa as pendentes, mas não cria solicitação', async () => {
    sessao.perfil = 'GESTOR_FROTA';
    api.listar.mockResolvedValue([pendente]);

    abrir();

    expect(await screen.findByRole('button', { name: 'Analisar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nova Solicitação/ })).not.toBeInTheDocument();
  });
});
