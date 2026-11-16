import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equipesSvoApi } from '../../services/api/equipesSvoApi';
import { solicitacoesSvoApi } from '../../services/api/solicitacoesSvoApi';
import { veiculosApi } from '../../services/api/veiculosApi';
import type { Motorista } from '../../types/motorista';
import type { Veiculo } from '../../types/veiculo';
import { operacoesAgendaveis } from '../../utils/permissoes';
import { ModalNovaViagem } from './ModalNovaViagem';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ usuario: null }),
}));
vi.mock('../../services/api/veiculosApi', () => ({
  veiculosApi: { listarOcupacaoSvo: vi.fn() },
}));
vi.mock('../../services/api/solicitacoesSvoApi', () => ({
  solicitacoesSvoApi: { listarTodas: vi.fn() },
}));
vi.mock('../../services/api/equipesSvoApi', () => ({
  equipesSvoApi: { listarDisponiveis: vi.fn() },
}));

const veiculoSvo: Veiculo = {
  id: 10,
  placa: 'JKL4G56',
  modelo: 'Fiat Ducato',
  tipo_frota: 'SVO',
  capacidade_maxima: 2,
  km_atual: 1000,
  status: 'DISPONIVEL',
};
const veiculoAdm: Veiculo = {
  ...veiculoSvo,
  id: 11,
  placa: 'ABC1D23',
  modelo: 'Fiat Uno',
  tipo_frota: 'ADMINISTRATIVA',
};
const motorista: Motorista = {
  id: 20,
  usuario_id: 5,
  nome: 'Marcos Oliveira',
  numero_cnh: '123',
  categoria_cnh: 'D',
  validade_cnh: '2030-01-01',
  tipo_motorista: 'FROTA',
  status: 'DISPONIVEL',
};

function abrir(perfil: Parameters<typeof operacoesAgendaveis>[0]) {
  render(
    <ModalNovaViagem
      solicitacoesAprovadas={[]}
      veiculos={[veiculoSvo, veiculoAdm]}
      motoristas={[motorista, { ...motorista, id: 21, tipo_motorista: 'SVO' }]}
      tiposPermitidos={operacoesAgendaveis(perfil)}
      onClose={vi.fn()}
      onSalvar={vi.fn()}
    />,
  );
}

const opcoesOperacao = () =>
  Array.from((screen.getByLabelText('Tipo de Operação *') as HTMLSelectElement).options).map(
    (o) => o.value,
  );

describe('ModalNovaViagem: agendamento administrativo x alocação SVO', () => {
  beforeEach(() => {
    vi.mocked(veiculosApi.listarOcupacaoSvo).mockResolvedValue([]);
    vi.mocked(solicitacoesSvoApi.listarTodas).mockResolvedValue([
      {
        id: 1,
        registrante_id: 4,
        dados_solicitante: 'Hospital',
        local_ocorrencia: 'Centro',
        material_sensivel: false,
        status: 'CONFIRMADA',
      },
    ]);
    vi.mocked(equipesSvoApi.listarDisponiveis).mockResolvedValue({
      periodo: { inicio: '2026-11-16T12:00:00.000Z', fim: '2026-11-16T13:00:00.000Z' },
      equipes: [],
    });
  });

  it('Gestor SVO só aloca ordens SVO: a operação administrativa nem aparece', async () => {
    abrir('GESTOR_SVO');

    expect(opcoesOperacao()).toEqual(['SVO']);
    expect(screen.getByLabelText('Tipo de Operação *')).toHaveValue('SVO');
    // Veículos da frota SVO, não da administrativa
    expect(screen.getByRole('option', { name: /Fiat Ducato/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Fiat Uno/ })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Solicitação SVO Vinculada *')).toBeInTheDocument();
  });

  it('Gestor de Frota só agenda viagens administrativas', () => {
    abrir('GESTOR_FROTA');

    expect(opcoesOperacao()).toEqual(['ADMINISTRATIVA']);
    expect(screen.getByRole('option', { name: /Fiat Uno/ })).toBeInTheDocument();
    expect(veiculosApi.listarOcupacaoSvo).not.toHaveBeenCalled();
  });

  it('Administrador escolhe entre as duas operações', () => {
    abrir('ADMINISTRADOR');

    expect(opcoesOperacao()).toEqual(['ADMINISTRATIVA', 'SVO']);
    expect(screen.getByLabelText('Tipo de Operação *')).toHaveValue('ADMINISTRATIVA');
  });
});
