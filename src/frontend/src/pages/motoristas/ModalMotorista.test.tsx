import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../services/api/http';
import { motoristasApi } from '../../services/api/motoristasApi';
import type { MotoristaDetalhe } from '../../types/motorista';
import { cnhVencida, combinarCategorias, erroCategoriaCnh, erroNumeroCnh, erroValidadeCnh, normalizarCnh } from '../../utils/cnh';
import { ModalMotorista } from './ModalMotorista';

vi.mock('../../services/api/motoristasApi', () => ({
  motoristasApi: { listarUsuariosElegiveis: vi.fn(), buscar: vi.fn(), criar: vi.fn(), atualizar: vi.fn() },
}));

// Dados sintéticos
const detalhe: MotoristaDetalhe = {
  id: 9,
  usuario_id: 5,
  nome: 'Motorista Sintético',
  numero_cnh: '01234567890',
  categoria_cnh: 'AB',
  validade_cnh: '2030-12-31',
  tipo_motorista: 'FROTA',
  status: 'DISPONIVEL',
  cnh_vencida: false,
};

const campo = (rotulo: RegExp) => screen.getByLabelText(rotulo) as HTMLInputElement;
const digitar = (rotulo: RegExp, valor: string) => fireEvent.change(campo(rotulo), { target: { value: valor } });
const salvar = (nome: RegExp) => fireEvent.click(screen.getByRole('button', { name: nome }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(motoristasApi.listarUsuariosElegiveis).mockResolvedValue([
    { id: 5, nome: 'Ana Frota', perfil: 'MOTORISTA_FROTA' },
    { id: 6, nome: 'Beto SVO', perfil: 'MOTORISTA_SVO' },
  ]);
  vi.mocked(motoristasApi.buscar).mockResolvedValue(detalhe);
  vi.mocked(motoristasApi.criar).mockResolvedValue(detalhe);
  vi.mocked(motoristasApi.atualizar).mockResolvedValue(detalhe);
});

async function abrirCriacao() {
  const onSalvo = vi.fn();
  const onClose = vi.fn();
  render(<ModalMotorista modo="criar" onClose={onClose} onSalvo={onSalvo} />);
  await screen.findByRole('option', { name: 'Ana Frota' });
  return { onSalvo, onClose };
}

describe('ModalMotorista: cadastro', () => {
  it('envia usuário, número normalizado com zeros e categoria combinada, sem tipo nem status', async () => {
    const { onSalvo, onClose } = await abrirCriacao();

    fireEvent.change(campo(/Usuário motorista/), { target: { value: '5' } });
    expect(screen.getByText('Frota Administrativa')).toBeTruthy();
    digitar(/Número da CNH/, '012.345.678-90');
    fireEvent.click(screen.getByRole('checkbox', { name: 'D' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'A' }));
    digitar(/Validade da CNH/, '2030-12-31');
    salvar(/Cadastrar Motorista/);

    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(detalhe));
    expect(motoristasApi.criar).toHaveBeenCalledWith({
      usuario_id: 5,
      numero_cnh: '01234567890',
      categoria_cnh: 'AD',
      validade_cnh: '2030-12-31',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('mostra os erros de cada campo antes de chamar o servidor', async () => {
    await abrirCriacao();

    digitar(/Número da CNH/, '1234');
    digitar(/Validade da CNH/, '2027-02-30');
    salvar(/Cadastrar Motorista/);

    expect(await screen.findByText('Selecione o usuário motorista.')).toBeTruthy();
    expect(screen.getByText(/A CNH deve conter 11 dígitos/)).toBeTruthy();
    expect(screen.getByText('Selecione ao menos uma categoria.')).toBeTruthy();
    // O campo de data do navegador descarta a data impossível; a função pura cobre o caso abaixo
    expect(screen.getByText('Informe a validade da CNH.')).toBeTruthy();
    expect(campo(/Número da CNH/).getAttribute('aria-invalid')).toBe('true');
    expect(motoristasApi.criar).not.toHaveBeenCalled();
  });

  it('combinação de categorias fora da lista aprovada é erro de campo', async () => {
    await abrirCriacao();

    fireEvent.click(screen.getByRole('checkbox', { name: 'B' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'C' }));
    salvar(/Cadastrar Motorista/);

    expect(await screen.findByText(/Combinação não aprovada/)).toBeTruthy();
  });

  it('409 de CNH duplicada aparece no campo do número', async () => {
    vi.mocked(motoristasApi.criar).mockRejectedValueOnce(
      new ApiError('Já existe um motorista cadastrado com esta CNH', 409, [], 'CNH_DUPLICADA'),
    );
    const { onSalvo } = await abrirCriacao();

    fireEvent.change(campo(/Usuário motorista/), { target: { value: '5' } });
    digitar(/Número da CNH/, '01234567890');
    fireEvent.click(screen.getByRole('checkbox', { name: 'B' }));
    digitar(/Validade da CNH/, '2030-12-31');
    salvar(/Cadastrar Motorista/);

    expect(await screen.findByText('Já existe um motorista cadastrado com esta CNH')).toBeTruthy();
    expect(campo(/Número da CNH/).getAttribute('aria-invalid')).toBe('true');
    expect(onSalvo).not.toHaveBeenCalled();
  });

  it('erros de validação do servidor vão para o campo indicado em detalhes', async () => {
    vi.mocked(motoristasApi.criar).mockRejectedValueOnce(
      new ApiError('Dados inválidos', 400, [{ campo: 'validade_cnh', mensagem: 'A validade deve estar entre 2000-01-01 e 2099-12-31' }]),
    );
    await abrirCriacao();

    fireEvent.change(campo(/Usuário motorista/), { target: { value: '6' } });
    digitar(/Número da CNH/, '01234567890');
    fireEvent.click(screen.getByRole('checkbox', { name: 'D' }));
    digitar(/Validade da CNH/, '2030-12-31');
    salvar(/Cadastrar Motorista/);

    expect(await screen.findByText('A validade deve estar entre 2000-01-01 e 2099-12-31')).toBeTruthy();
    expect(campo(/Validade da CNH/).getAttribute('aria-invalid')).toBe('true');
  });

  it('CNH vencida gera aviso, não bloqueio', async () => {
    await abrirCriacao();

    fireEvent.change(campo(/Usuário motorista/), { target: { value: '5' } });
    digitar(/Número da CNH/, '01234567890');
    fireEvent.click(screen.getByRole('checkbox', { name: 'B' }));
    digitar(/Validade da CNH/, '2020-01-01');

    expect(screen.getByText(/Esta CNH está vencida/)).toBeTruthy();
    salvar(/Cadastrar Motorista/);
    await waitFor(() => expect(motoristasApi.criar).toHaveBeenCalled());
  });
});

describe('ModalMotorista: edição', () => {
  async function abrirEdicao() {
    render(<ModalMotorista modo="editar" motoristaId={9} onClose={vi.fn()} onSalvo={vi.fn()} />);
    await waitFor(() => expect(campo(/Número da CNH/).value).toBe('01234567890'));
  }

  it('carrega o detalhe e envia só o campo alterado', async () => {
    await abrirEdicao();

    expect(screen.getByText('Motorista Sintético')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'A' }) as HTMLInputElement).checked).toBe(true);
    digitar(/Validade da CNH/, '2031-01-15');
    salvar(/Salvar alterações/);

    await waitFor(() => expect(motoristasApi.atualizar).toHaveBeenCalledWith(9, { validade_cnh: '2031-01-15' }));
  });

  it('não chama o servidor sem alteração', async () => {
    await abrirEdicao();

    salvar(/Salvar alterações/);

    expect(await screen.findByText('Nenhuma alteração para salvar.')).toBeTruthy();
    expect(motoristasApi.atualizar).not.toHaveBeenCalled();
  });

  it('número com separadores equivalente ao atual não conta como alteração', async () => {
    await abrirEdicao();

    digitar(/Número da CNH/, '012.345.678-90');
    fireEvent.click(screen.getByRole('checkbox', { name: 'B' }));
    salvar(/Salvar alterações/);

    await waitFor(() => expect(motoristasApi.atualizar).toHaveBeenCalledWith(9, { categoria_cnh: 'A' }));
  });
});

describe('regras de CNH no cliente', () => {
  it('espelham as do servidor', () => {
    expect(normalizarCnh(' 000.123.456-78 ')).toBe('00012345678');
    expect(erroNumeroCnh('00012345678')).toBeNull();
    expect(erroNumeroCnh('00000000000')).toBe('Número de CNH inválido.');
    expect(erroNumeroCnh('0001234567A')).toMatch(/11 dígitos/);
    expect(combinarCategorias(['E', 'A'])).toBe('AE');
    expect(erroCategoriaCnh('AE')).toBeNull();
    expect(erroCategoriaCnh('BC')).toMatch(/não aprovada/);
    expect(erroValidadeCnh('2028-02-29')).toBeNull();
    expect(erroValidadeCnh('2027-02-29')).toBe('Data de validade inválida.');
    expect(erroValidadeCnh('1999-12-31')).toMatch(/entre/);
    expect(cnhVencida('2029-12-30', '2029-12-31')).toBe(true);
    expect(cnhVencida('2029-12-31', '2029-12-31')).toBe(false);
  });
});
