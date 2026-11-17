import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ManutencoesPage from './ManutencoesPage';
import { ModalAbastecimento } from './abastecimento/ModalAbastecimento';
import { ModalMulta } from './multas/ModalMulta';
import { manutencoesApi } from '../services/api/manutencoesApi';
import { motoristasApi } from '../services/api/motoristasApi';
import { veiculosApi } from '../services/api/veiculosApi';
import type { Perfil } from '../types/usuario';
import type { Veiculo } from '../types/veiculo';
import { perfilPode, podeEditarFrota } from '../utils/permissoes';
import type { Permissao } from '../utils/permissoes';

const sessao = vi.hoisted(() => ({ perfil: 'GESTOR_FROTA' as string }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 1, nome: 'Usuário Teste', perfil: sessao.perfil },
    temPerfil: (...perfis: string[]) => perfis.includes(sessao.perfil),
  }),
}));
vi.mock('../services/api/veiculosApi', () => ({ veiculosApi: { listar: vi.fn() } }));
vi.mock('../services/api/motoristasApi', () => ({
  motoristasApi: { listar: vi.fn(), buscarMeuPerfil: vi.fn() },
}));
vi.mock('../services/api/manutencoesApi', () => ({
  manutencoesApi: { listarTodas: vi.fn(), criar: vi.fn() },
}));

const veiculoSvo: Veiculo = {
  id: 1,
  placa: 'SVO1A11',
  modelo: 'Fiat Ducato',
  tipo_frota: 'SVO',
  capacidade_maxima: 2,
  km_atual: 1000,
  status: 'DISPONIVEL',
};
const veiculoAdm: Veiculo = {
  ...veiculoSvo,
  id: 2,
  placa: 'ADM2B22',
  modelo: 'Fiat Uno',
  tipo_frota: 'ADMINISTRATIVA',
};

/** Mesmo filtro que as telas montam com `podeNaFrota`. */
const filtroDo = (perfil: Perfil, permissao: Permissao) => (v: Veiculo) =>
  perfilPode(perfil, permissao) && podeEditarFrota(perfil, v.tipo_frota);

/** Erro de envio sem veículo válido (não confundir com o placeholder do select). */
const ERRO_SEM_VEICULO = /^Selecione (o veículo\.|um veículo(\.| que o seu perfil))/;

const seletorVeiculo = () => screen.getByLabelText('Veículo *') as HTMLSelectElement;
const opcoesVeiculo = () =>
  Array.from(seletorVeiculo().options)
    .map((o) => o.value)
    .filter(Boolean);

beforeEach(() => {
  vi.clearAllMocks();
  sessao.perfil = 'GESTOR_FROTA';
  // O veículo SVO vem primeiro: antes, era ele que ficava pré-selecionado
  vi.mocked(veiculosApi.listar).mockResolvedValue([veiculoSvo, veiculoAdm]);
  vi.mocked(motoristasApi.listar).mockResolvedValue([]);
  vi.mocked(manutencoesApi.listarTodas).mockResolvedValue([]);
  vi.mocked(manutencoesApi.criar).mockResolvedValue({} as never);
});

describe('ModalMulta: só veículos da frota permitida', () => {
  it('Gestor de Frota: pré-seleciona o veículo administrativo e envia para ele', async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(
      <ModalMulta
        onClose={vi.fn()}
        onSalvar={onSalvar}
        filtrarVeiculo={filtroDo('GESTOR_FROTA', 'multas.gerenciar')}
      />,
    );

    await waitFor(() => expect(seletorVeiculo().value).toBe('2'));
    expect(opcoesVeiculo()).toEqual(['2']);

    await userEvent.type(screen.getByLabelText('Valor (R$) *'), '130');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar multa' }));

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    expect(onSalvar.mock.calls[0][0]).toMatchObject({ veiculo_id: 2 });
  });

  it('ação rápida com veículo de outra frota: a seleção é trocada pelo permitido', async () => {
    render(
      <ModalMulta
        onClose={vi.fn()}
        onSalvar={vi.fn()}
        veiculoIdInicial="1"
        filtrarVeiculo={filtroDo('GESTOR_FROTA', 'multas.gerenciar')}
      />,
    );

    await waitFor(() => expect(seletorVeiculo().value).toBe('2'));
  });

  it('Gestor SVO não tem veículo permitido: não envia multa para veículo administrativo', async () => {
    const onSalvar = vi.fn();
    render(
      <ModalMulta
        onClose={vi.fn()}
        onSalvar={onSalvar}
        veiculoIdInicial="2"
        filtrarVeiculo={filtroDo('GESTOR_SVO', 'multas.gerenciar')}
      />,
    );

    // Com a seleção inicial ('2') fora da lista ou já limpa, o envio é recusado
    await waitFor(() => expect(veiculosApi.listar).toHaveBeenCalled());
    expect(opcoesVeiculo()).toEqual([]);
    fireEvent.submit(seletorVeiculo().closest('form')!);

    expect(await screen.findByText(ERRO_SEM_VEICULO)).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});

describe('ModalAbastecimento: só veículos da frota permitida', () => {
  it('ação rápida com veículo SVO para o Gestor de Frota: troca pelo administrativo', async () => {
    render(
      <ModalAbastecimento
        onClose={vi.fn()}
        onSalvar={vi.fn()}
        veiculoIdInicial="1"
        filtrarVeiculo={filtroDo('GESTOR_FROTA', 'abastecimentos.registrar')}
      />,
    );

    await waitFor(() => expect(seletorVeiculo().value).toBe('2'));
    expect(opcoesVeiculo()).toEqual(['2']);
  });

  it('sem veículo permitido, o envio é bloqueado', async () => {
    vi.mocked(veiculosApi.listar).mockResolvedValue([veiculoSvo]);
    const onSalvar = vi.fn();
    render(
      <ModalAbastecimento
        onClose={vi.fn()}
        onSalvar={onSalvar}
        veiculoIdInicial="1"
        filtrarVeiculo={filtroDo('GESTOR_FROTA', 'abastecimentos.registrar')}
      />,
    );

    await waitFor(() => expect(veiculosApi.listar).toHaveBeenCalled());
    expect(opcoesVeiculo()).toEqual([]);
    fireEvent.submit(seletorVeiculo().closest('form')!);

    expect(await screen.findByText(ERRO_SEM_VEICULO)).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });
});

describe('ManutencoesPage: nova manutenção só em veículo da frota permitida', () => {
  function abrir() {
    render(
      <MemoryRouter>
        <ManutencoesPage />
      </MemoryRouter>,
    );
  }

  it('Gestor de Frota: lista e pré-seleciona só o administrativo e envia para ele', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Nova Manutenção/ }));

    await waitFor(() => expect(seletorVeiculo().value).toBe('2'));
    expect(opcoesVeiculo()).toEqual(['2']);

    await userEvent.type(screen.getByLabelText('Custo Estimado / Real (R$) *'), '250');
    await userEvent.type(screen.getByLabelText('Descrição Detalhada do Serviço *'), 'Troca de óleo');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar Manutenção' }));

    await waitFor(() => expect(manutencoesApi.criar).toHaveBeenCalledTimes(1));
    expect(vi.mocked(manutencoesApi.criar).mock.calls[0][0]).toMatchObject({ veiculo_id: 2 });
  });

  it('só há veículos SVO: nada é selecionado e o envio é bloqueado', async () => {
    vi.mocked(veiculosApi.listar).mockResolvedValue([veiculoSvo]);
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: /Nova Manutenção/ }));

    expect(seletorVeiculo().value).toBe('');
    expect(opcoesVeiculo()).toEqual([]);
    expect(screen.getByRole('option', { name: /Nenhum veículo disponível para o seu perfil/ }))
      .toBeInTheDocument();
    fireEvent.submit(seletorVeiculo().closest('form')!);

    expect(await screen.findByText('Selecione um veículo.')).toBeInTheDocument();
    expect(manutencoesApi.criar).not.toHaveBeenCalled();
  });

  it('Gestor SVO não acessa o cadastro de manutenções', async () => {
    sessao.perfil = 'GESTOR_SVO';
    abrir();

    await waitFor(() => expect(veiculosApi.listar).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Nova Manutenção/ })).not.toBeInTheDocument();
  });
});
