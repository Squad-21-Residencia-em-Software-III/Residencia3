import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { ApiError } from '../../services/api/http';
import { equipesSvoApi } from '../../services/api/equipesSvoApi';
import { veiculosApi } from '../../services/api/veiculosApi';
import { viagensApi } from '../../services/api/viagensApi';
import type { Motorista } from '../../types/motorista';
import type { Veiculo } from '../../types/veiculo';
import { CODIGO_CONFIRMAR_INTERVALO } from '../../types/viagem';
import { ModalAgendarColetaSvo } from './ModalAgendarColetaSvo';

vi.mock('../../services/api/equipesSvoApi', () => ({ equipesSvoApi: { listarDisponiveis: vi.fn() } }));
vi.mock('../../services/api/viagensApi', () => ({ viagensApi: { agendarColetaSvo: vi.fn(), reprogramarColetaSvo: vi.fn() } }));
vi.mock('../../services/api/veiculosApi', () => ({
  veiculosApi: { listarOcupacaoSvo: vi.fn() },
}));

const veiculos: Veiculo[] = [
  { id: 1, placa: 'ADM1A11', modelo: 'Van Adm', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 8, km_atual: 0, status: 'DISPONIVEL' },
  { id: 2, placa: 'SVO2B22', modelo: 'Rabecão', tipo_frota: 'SVO', capacidade_maxima: 4, km_atual: 0, status: 'DISPONIVEL' },
];
const motoristas: Motorista[] = [
  { id: 5, usuario_id: 5, nome: 'Ana SVO', numero_cnh: '1', categoria_cnh: 'D', validade_cnh: '2030-01-01', tipo_motorista: 'SVO', status: 'DISPONIVEL' },
  { id: 6, usuario_id: 6, nome: 'Beto Frota', numero_cnh: '2', categoria_cnh: 'B', validade_cnh: '2030-01-01', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
];
const ordem = {
  ordem_id: 40,
  solicitacao_id: 31,
  local_ocorrencia: 'Av. Beira Mar, 500',
  material_sensivel: false,
  confirmado_em: null,
};

const api = vi.mocked(viagensApi);

function abrir() {
  const onAgendada = vi.fn();
  const onClose = vi.fn();
  render(
    <ModalAgendarColetaSvo
      ordem={ordem}
      veiculos={veiculos}
      motoristas={motoristas}
      onClose={onClose}
      onAgendada={onAgendada}
    />,
  );
  return { onAgendada, onClose };
}

/** Data local no formato de `datetime-local`, a partir de agora. */
function daquiA(horas: number) {
  const d = new Date(Date.now() + horas * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

describe('ModalAgendarColetaSvo (SCRUM-172)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(veiculosApi.listarOcupacaoSvo).mockResolvedValue([]);
    vi.mocked(equipesSvoApi.listarDisponiveis).mockResolvedValue({ periodo: { inicio: '', fim: '' }, equipes: [{ id: 12, nome_equipe: 'Equipe 12' }] });
  });

  afterEach(() => {
    RECURSOS_BACKEND.agendamentoTemporalSvo = false;
  });

  it('só oferece veículo e motorista SVO', () => {
    abrir();
    expect(screen.getByRole('option', { name: /Rabecão/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Van Adm/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Ana SVO/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Beto Frota/ })).not.toBeInTheDocument();
  });

  it('sem o agendamento temporal do backend, aloca para atendimento imediato', async () => {
    api.agendarColetaSvo.mockResolvedValue({} as never);
    const { onAgendada, onClose } = abrir();

    expect(screen.queryByLabelText(/Início previsto/)).not.toBeInTheDocument();
    expect(screen.getByText('A coleta será alocada para atendimento imediato.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));

    expect(api.agendarColetaSvo).toHaveBeenCalledWith({
      solicitacao_id: 31,
      veiculo_id: 2,
      motorista_id: 5,
    });
    await waitFor(() => expect(onAgendada).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('envia a equipe opcional escolhida', async () => {
    api.agendarColetaSvo.mockResolvedValue({} as never);
    abrir();
    await userEvent.selectOptions(await screen.findByLabelText('Equipe SVO (opcional)'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
    expect(api.agendarColetaSvo).toHaveBeenCalledWith(expect.objectContaining({ equipe_id: 12 }));
  });

  it('permite alocar sem equipe quando a consulta falha', async () => {
    vi.mocked(equipesSvoApi.listarDisponiveis).mockRejectedValueOnce(new Error('indisponível'));
    api.agendarColetaSvo.mockResolvedValue({} as never);
    abrir();
    expect(await screen.findByText(/ainda pode alocar a ordem sem equipe/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
    expect(api.agendarColetaSvo.mock.calls[0][0]).not.toHaveProperty('equipe_id');
  });

  describe('com o agendamento temporal (SCRUM-182)', () => {
    beforeEach(() => {
      RECURSOS_BACKEND.agendamentoTemporalSvo = true;
    });

    it('reprograma mantendo ordem, equipe e capacidade da coleta', async () => {
      api.reprogramarColetaSvo.mockResolvedValue({} as never);
      const viagem = {
        id: 40, solicitacao_id: 31, tipo_operacao: 'SVO' as const, origem: null,
        destino: 'Av. Beira Mar', finalidade: null, solicitante_nome: null,
        veiculo_id: 2, veiculo_modelo: 'Rabecão', veiculo_placa: 'SVO2B22',
        motorista_id: 5, motorista_nome: 'Ana', equipe_id: 12, capacidade_utilizada: 2,
        km_inicial: null, status: 'AGENDADA' as const,
        inicio_previsto: new Date(Date.now() + 7_200_000).toISOString(),
        fim_previsto: new Date(Date.now() + 10_800_000).toISOString(),
      };
      render(<ModalAgendarColetaSvo ordem={ordem} viagemReprogramar={viagem} veiculos={veiculos}
        motoristas={motoristas} onClose={vi.fn()} onAgendada={vi.fn()} />);
      await screen.findByRole('option', { name: 'Equipe 12' });
      await userEvent.click(screen.getByRole('button', { name: 'Reagendar coleta' }));
      await waitFor(() => expect(api.reprogramarColetaSvo).toHaveBeenCalledWith(40,
        expect.objectContaining({ solicitacao_id: 31, equipe_id: 12, capacidade_utilizada: 2 })));
      expect(api.agendarColetaSvo).not.toHaveBeenCalled();
    });

    it('exige término depois do início', async () => {
      abrir();
      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(3) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(2) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));

      expect(screen.getByText('O término previsto deve ser depois do início.')).toBeInTheDocument();
      expect(api.agendarColetaSvo).not.toHaveBeenCalled();
    });

    it('intervalo menor que 20 min: mostra o aviso e só reenvia com a ciência do gestor', async () => {
      api.agendarColetaSvo
        .mockRejectedValueOnce(
          new ApiError('Intervalo reduzido entre coletas.', 409, [], CODIGO_CONFIRMAR_INTERVALO, {
            token_confirmacao: 'desafio-assinado',
            conflitos: [
              {
                recurso: 'VEICULO',
                descricao: 'Rabecão (SVO2B22)',
                inicio: '2026-11-17T17:00:00.000Z',
                fim: '2026-11-17T19:00:00.000Z',
                intervalo_minutos: 10,
              },
            ],
          }),
        )
        .mockResolvedValueOnce({} as never);
      const { onAgendada } = abrir();

      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(2) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(3) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));

      expect(await screen.findByText('Intervalo menor que 20 minutos')).toBeInTheDocument();
      expect(screen.getByText(/10 min de intervalo/)).toBeInTheDocument();
      const confirmar = screen.getByRole('button', { name: 'Confirmar agendamento' });
      expect(confirmar).toBeDisabled();
      expect(onAgendada).not.toHaveBeenCalled();

      await userEvent.click(screen.getByLabelText(/Estou ciente do intervalo reduzido/));
      await userEvent.click(confirmar);

      expect(api.agendarColetaSvo).toHaveBeenCalledTimes(2);
      expect(api.agendarColetaSvo.mock.calls[0][0]).not.toHaveProperty('confirmar_intervalo_reduzido');
      expect(api.agendarColetaSvo.mock.calls[1][0]).toMatchObject({
        solicitacao_id: 31,
        confirmar_intervalo_reduzido: true,
        token_confirmacao: 'desafio-assinado',
      });
      await waitFor(() => expect(onAgendada).toHaveBeenCalled());
    });

    it('alterar um campo depois do aviso exige nova validação do servidor', async () => {
      api.agendarColetaSvo.mockRejectedValueOnce(
        new ApiError('Intervalo reduzido.', 409, [], CODIGO_CONFIRMAR_INTERVALO, { conflitos: [], token_confirmacao: 'desafio-assinado' }),
      );
      abrir();
      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(2) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(3) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
      await screen.findByText('Intervalo menor que 20 minutos');

      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(4) } });

      expect(screen.queryByText('Intervalo menor que 20 minutos')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agendar coleta' })).toBeInTheDocument();
    });

    it('sobreposição real (409) bloqueia, sem opção de forçar', async () => {
      api.agendarColetaSvo.mockRejectedValueOnce(
        new ApiError('O veículo já está reservado nesse período.', 409, [], 'CONFLITO_AGENDA'),
      );
      const { onAgendada } = abrir();
      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(2) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(3) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));

      expect(
        await screen.findByText('O veículo já está reservado nesse período.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirmar agendamento' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Estou ciente/)).not.toBeInTheDocument();
      expect(onAgendada).not.toHaveBeenCalled();
    });
  });
});
