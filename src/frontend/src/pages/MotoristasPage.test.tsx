import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { motoristasApi } from '../services/api/motoristasApi';
import type { Motorista } from '../types/motorista';
import type { Perfil } from '../types/usuario';
import MotoristasPage from './MotoristasPage';

const estado = vi.hoisted(() => ({ perfil: 'ADMINISTRADOR' as string, escrita: true }));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ usuario: { id: 1, perfil: estado.perfil } }) }));
vi.mock('../config/recursosBackend', () => ({
  RECURSOS_BACKEND: new Proxy({}, { get: (_alvo, chave) => (chave === 'escritaMotoristas' ? estado.escrita : false) }),
  recursoAtivo: () => false,
}));
vi.mock('../services/api/motoristasApi', () => ({
  motoristasApi: { listar: vi.fn(), listarUsuariosElegiveis: vi.fn(async () => []), buscar: vi.fn(), criar: vi.fn(), atualizar: vi.fn() },
}));

// Dados sintéticos
const lista: Motorista[] = [
  { id: 1, usuario_id: 10, nome: 'Ana Frota', cnh_final: '7890', categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
  { id: 2, usuario_id: 11, nome: 'Beto SVO', cnh_final: '0001', categoria_cnh: 'D', validade_cnh: '2030-12-31', tipo_motorista: 'SVO', status: 'DISPONIVEL' },
];

async function renderizar(perfil: Perfil, escrita = true) {
  estado.perfil = perfil;
  estado.escrita = escrita;
  render(<MotoristasPage />);
  await screen.findByText('Ana Frota');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(motoristasApi.listar).mockResolvedValue(lista);
});

describe('MotoristasPage (SCRUM-308)', () => {
  it('mostra a CNH mascarada e nunca o número integral', async () => {
    await renderizar('ADMINISTRADOR');

    expect(screen.getByText('•••••••7890')).toBeTruthy();
    expect(screen.getByPlaceholderText('Buscar por nome...')).toBeTruthy();
  });

  it('Administrador cadastra e edita os dois tipos', async () => {
    await renderizar('ADMINISTRADOR');

    expect(screen.getByRole('button', { name: 'Cadastrar motorista' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar CNH de Ana Frota' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar CNH de Beto SVO' })).toBeTruthy();
  });

  it('Gestor de Frota edita só motorista FROTA', async () => {
    await renderizar('GESTOR_FROTA');

    expect(screen.getByRole('button', { name: 'Editar CNH de Ana Frota' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar CNH de Beto SVO' })).toBeNull();
  });

  it('Gestor SVO edita só motorista SVO', async () => {
    await renderizar('GESTOR_SVO');

    expect(screen.queryByRole('button', { name: 'Editar CNH de Ana Frota' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar CNH de Beto SVO' })).toBeTruthy();
  });

  it('sem a flag, nenhuma ação de escrita aparece', async () => {
    await renderizar('ADMINISTRADOR', false);

    expect(screen.queryByRole('button', { name: 'Cadastrar motorista' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar CNH/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).toBeNull();
  });

  it('abre o modal de cadastro', async () => {
    await renderizar('ADMINISTRADOR');

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar motorista' }));

    expect(await screen.findByRole('dialog', { name: 'Cadastrar Motorista' })).toBeTruthy();
    expect(motoristasApi.listarUsuariosElegiveis).toHaveBeenCalled();
  });
});
