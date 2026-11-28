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
import { CODIGO_CONFIRMAR_INTERVALO, type ConflitoIntervaloSvo } from '../../types/viagem';
import { ModalAgendarColetaSvo } from './ModalAgendarColetaSvo';

vi.mock('../../services/api/equipesSvoApi', () => ({ equipesSvoApi: { listarDisponiveis: vi.fn(), integrantesEquipe: vi.fn(), disponibilidadeIntegrantes: vi.fn(), designacoes: vi.fn() } }));
vi.mock('../../services/api/viagensApi', () => ({ viagensApi: { agendarColetaSvo: vi.fn(), reprogramarColetaSvo: vi.fn() } }));
vi.mock('../../services/api/veiculosApi', () => ({
  veiculosApi: { listarOcupacaoSvo: vi.fn() },
}));

const veiculos: Veiculo[] = [
  { id: 1, placa: 'ADM1A11', modelo: 'Van Adm', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 8, km_atual: 0, status: 'DISPONIVEL' },
  { id: 2, placa: 'SVO2B22', modelo: 'Rabecão', tipo_frota: 'SVO', capacidade_maxima: 4, lotacao_cabine: 3, km_atual: 0, status: 'DISPONIVEL' },
];
const motoristas: Motorista[] = [
  { id: 5, usuario_id: 5, nome: 'Ana SVO', cnh_final: '0001', categoria_cnh: 'D', validade_cnh: '2030-01-01', tipo_motorista: 'SVO', status: 'DISPONIVEL' },
  { id: 6, usuario_id: 6, nome: 'Beto Frota', cnh_final: '0002', categoria_cnh: 'B', validade_cnh: '2030-01-01', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
];
const ordem = {
  ordem_id: 40,
  solicitacao_id: 31,
  local_ocorrencia: 'Av. Beira Mar, 500',
  material_sensivel: false,
  confirmado_em: null,
};

const api = vi.mocked(viagensApi);

function abrir(onAtualizarRecursos = vi.fn().mockResolvedValue(undefined)) {
  const onAgendada = vi.fn();
  const onClose = vi.fn();
  render(
    <ModalAgendarColetaSvo
      ordem={ordem}
      veiculos={veiculos}
      motoristas={motoristas}
      onClose={onClose}
      onAgendada={onAgendada}
      onAtualizarRecursos={onAtualizarRecursos}
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
    vi.mocked(equipesSvoApi.integrantesEquipe).mockResolvedValue([{ id: 22, nome: 'Maria', email: 'maria@exemplo.com' }]);
    vi.mocked(equipesSvoApi.disponibilidadeIntegrantes).mockResolvedValue([{ id: 22, nome: 'Maria', email: 'maria@exemplo.com', disponivel: true }]);
    vi.mocked(equipesSvoApi.designacoes).mockResolvedValue({ equipe_id: 12, iniciada: false, integrantes_ids: [22] });
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
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Maria' })).toBeEnabled());
    await userEvent.click(screen.getByRole('checkbox', { name: 'Maria' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
    expect(api.agendarColetaSvo).toHaveBeenCalledWith(expect.objectContaining({ equipe_id: 12, integrantes_ids: [22] }));
  });

  it('impede agendamento com equipe sem integrante designado', async () => {
    abrir();
    await userEvent.selectOptions(await screen.findByLabelText('Equipe SVO (opcional)'), '12');
    await screen.findByRole('checkbox', { name: 'Maria' });
    await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
    expect(screen.getByText('Selecione pelo menos um integrante da equipe.')).toBeInTheDocument();
    expect(api.agendarColetaSvo).not.toHaveBeenCalled();
  });

  it('orienta a cadastrar a lotação antes de agendar uma coleta com equipe', async () => {
    render(<ModalAgendarColetaSvo ordem={ordem} veiculos={[{ ...veiculos[1], lotacao_cabine: null }]}
      motoristas={motoristas} onClose={vi.fn()} onAgendada={vi.fn()} />);
    await userEvent.selectOptions(await screen.findByLabelText('Equipe SVO (opcional)'), '12');
    expect(screen.getByText(/Cadastre a lotação da cabine/)).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: 'Maria' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
    expect(api.agendarColetaSvo).not.toHaveBeenCalled();
  });

  it('não permite selecionar integrante em cabine de um lugar', async () => {
    render(<ModalAgendarColetaSvo ordem={ordem} veiculos={[{ ...veiculos[1], lotacao_cabine: 1 }]} motoristas={motoristas}
      onClose={vi.fn()} onAgendada={vi.fn()} />);
    await userEvent.selectOptions(await screen.findByLabelText('Equipe SVO (opcional)'), '12');
    expect(await screen.findByRole('checkbox', { name: 'Maria' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
    expect(api.agendarColetaSvo).not.toHaveBeenCalled();
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

    it('permite consultar um veículo ocupado agora para um período futuro', async () => {
      vi.mocked(veiculosApi.listarOcupacaoSvo).mockResolvedValueOnce([{
        id: 2, placa: 'SVO2B22', modelo: 'Rabecão', status: 'EM_USO',
        capacidade_maxima: 4, capacidade_utilizada: 4, vagas_disponiveis: 0,
      }]);
      api.agendarColetaSvo.mockResolvedValueOnce({} as never);
      const { onAgendada } = abrir();
      await screen.findByText(/ocupação atual: 4\/4/);
      expect(screen.queryByText('Alocação bloqueada')).not.toBeInTheDocument();
      expect(screen.getByText(/disponibilidade para o período escolhido/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(24) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(25) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));
      await waitFor(() => expect(onAgendada).toHaveBeenCalled());
    });

    it('apresenta ausência de veículos e impede o envio', () => {
      render(<ModalAgendarColetaSvo ordem={ordem} veiculos={[]} motoristas={motoristas} onClose={vi.fn()} onAgendada={vi.fn()} />);
      expect(screen.getByText('Nenhum veículo SVO elegível cadastrado')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agendar coleta' })).toBeDisabled();
    });

    it('avisa falha na ocupação sem impedir validação temporal pelo servidor', async () => {
      vi.mocked(veiculosApi.listarOcupacaoSvo).mockRejectedValueOnce(new Error('Falha na consulta'));
      abrir();
      expect(await screen.findByText(/Não foi possível carregar a ocupação dos veículos/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agendar coleta' })).toBeEnabled();
    });

    const viagem = {
      id: 40, solicitacao_id: 31, tipo_operacao: 'SVO' as const, origem: null,
      destino: 'Av. Beira Mar', finalidade: null, solicitante_nome: null,
      veiculo_id: 2, veiculo_modelo: 'Rabecão', veiculo_placa: 'SVO2B22',
      motorista_id: 5, motorista_nome: 'Ana', equipe_id: 12, capacidade_utilizada: 2,
      km_inicial: null, status: 'AGENDADA' as const,
      inicio_previsto: new Date(Date.now() + 7_200_000).toISOString(),
      fim_previsto: new Date(Date.now() + 10_800_000).toISOString(),
    };

    function abrirReagendamento(veiculosDoTeste = veiculos) {
      render(<ModalAgendarColetaSvo ordem={ordem} viagemReprogramar={viagem} veiculos={veiculosDoTeste}
        motoristas={motoristas} onClose={vi.fn()} onAgendada={vi.fn()} />);
    }

    const maria = { id: 22, nome: 'Maria', email: 'maria@exemplo.com' };
    const joao = { id: 23, nome: 'João', email: 'joao@exemplo.com' };
    const participante = (nome: string) => screen.getByRole('checkbox', { name: nome });
    const confirmar = () => userEvent.click(screen.getByRole('button', { name: 'Reagendar coleta' }));

    function carregarComposicao() {
      vi.mocked(equipesSvoApi.designacoes).mockResolvedValue({ equipe_id: 12, iniciada: false, integrantes_ids: [22, 23] });
      vi.mocked(equipesSvoApi.integrantesEquipe).mockResolvedValue([maria, joao]);
      vi.mocked(equipesSvoApi.disponibilidadeIntegrantes).mockResolvedValue([maria, joao].map((i) => ({ ...i, disponivel: true })));
    }

    it('altera apenas o horário e preserva a composição persistida', async () => {
      carregarComposicao();
      api.reprogramarColetaSvo.mockResolvedValue({} as never);
      abrirReagendamento();
      await waitFor(() => expect(participante('Maria')).toBeChecked());
      const novoFim = daquiA(5);
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: novoFim } });
      await screen.findByRole('option', { name: 'Equipe 12' });
      expect(participante('João')).toBeChecked();
      await confirmar();
      expect(api.reprogramarColetaSvo).toHaveBeenCalledWith(40,
        expect.objectContaining({ equipe_id: 12, capacidade_utilizada: 2, fim_previsto: new Date(novoFim).toISOString(), integrantes_ids: [22, 23] }));
      expect(api.agendarColetaSvo).not.toHaveBeenCalled();
    });

    it('seleciona a nova equipe sem herdar integrantes e restaura a composição ao voltar', async () => {
      carregarComposicao();
      vi.mocked(equipesSvoApi.listarDisponiveis).mockResolvedValue({ periodo: { inicio: '', fim: '' },
        equipes: [{ id: 12, nome_equipe: 'Equipe 12' }, { id: 13, nome_equipe: 'Equipe 13' }] });
      const lia = { id: 30, nome: 'Lia', email: 'lia@exemplo.com' };
      vi.mocked(equipesSvoApi.integrantesEquipe).mockImplementation(async (id) => id === 12 ? [maria, joao] : [lia]);
      vi.mocked(equipesSvoApi.disponibilidadeIntegrantes).mockImplementation(async (id) =>
        (id === 12 ? [maria, joao] : [lia]).map((i) => ({ ...i, disponivel: true })));
      abrirReagendamento();
      await waitFor(() => expect(participante('Maria')).toBeChecked());
      const seletor = await screen.findByLabelText('Equipe SVO (opcional)');
      await userEvent.selectOptions(seletor, '13');
      await waitFor(() => expect(participante('Lia')).toBeEnabled());
      expect(participante('Lia')).not.toBeChecked();
      expect(screen.queryByRole('checkbox', { name: 'Maria' })).not.toBeInTheDocument();
      await confirmar();
      expect(api.reprogramarColetaSvo).not.toHaveBeenCalled();
      await userEvent.click(participante('Lia'));
      await userEvent.selectOptions(seletor, '12');
      await waitFor(() => expect(participante('Maria')).toBeChecked());
      expect(participante('João')).toBeChecked();
      expect(screen.queryByRole('checkbox', { name: 'Lia' })).not.toBeInTheDocument();
    });

    it('bloqueia cabine menor sem retirar ninguém da composição', async () => {
      carregarComposicao();
      abrirReagendamento([...veiculos, { ...veiculos[1], id: 99, modelo: 'Cabine menor', lotacao_cabine: 2 }]);
      await waitFor(() => expect(participante('Maria')).toBeChecked());
      await userEvent.selectOptions(screen.getByLabelText('Veículo SVO *'), '99');
      await confirmar();
      expect(await screen.findByText('A lotação da cabine não comporta os integrantes selecionados.')).toBeInTheDocument();
      expect(participante('Maria')).toBeChecked();
      expect(participante('João')).toBeChecked();
      expect(api.reprogramarColetaSvo).not.toHaveBeenCalled();
    });

    it.each([
      ['consulta falhou', 'Falha ao carregar designações'],
      ['coleta iniciada', 'A coleta já foi iniciada ou a equipe mudou.'],
    ])('impede o envio se %s', async (situacao, mensagem) => {
      if (situacao === 'consulta falhou') vi.mocked(equipesSvoApi.designacoes).mockRejectedValueOnce(new Error(mensagem));
      else vi.mocked(equipesSvoApi.designacoes).mockResolvedValueOnce({ equipe_id: 12, iniciada: true, integrantes_ids: [22] });
      abrirReagendamento();
      expect(await screen.findByText(mensagem, { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reagendar coleta' })).toBeDisabled();
      await confirmar();
      expect(api.reprogramarColetaSvo).not.toHaveBeenCalled();
    });

    it('exige término depois do início', async () => {
      abrir();
      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(3) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(2) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));

      expect(screen.getByText('O término previsto deve ser depois do início.')).toBeInTheDocument();
      expect(api.agendarColetaSvo).not.toHaveBeenCalled();
    });

    it('intervalo menor que 20 min: identifica os recursos e só reenvia com a ciência do gestor', async () => {
      const reserva = { inicio: '2026-11-17T17:00:00Z', fim: '2026-11-17T19:00:00Z' };
      const conflitos: ConflitoIntervaloSvo[] = [
        { ...reserva, recurso: 'VEICULO', descricao: 'Rabecão (SVO2B22)', intervalo_minutos: 10 },
        { ...reserva, recurso: 'MOTORISTA', descricao: '#5', intervalo_minutos: 11 },
        { ...reserva, recurso: 'EQUIPE', descricao: '#9', intervalo_minutos: 12 },
        { ...reserva, recurso: 'INTEGRANTE', descricao: '#12', intervalo_minutos: 15 },
      ];
      api.agendarColetaSvo
        .mockRejectedValueOnce(
          new ApiError('Intervalo reduzido entre coletas.', 409, [], CODIGO_CONFIRMAR_INTERVALO, {
            token_confirmacao: 'desafio-assinado',
            conflitos,
          }),
        )
        .mockResolvedValueOnce({} as never);
      const { onAgendada } = abrir();

      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(2) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(3) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));

      expect(await screen.findByText('Intervalo menor que 20 minutos')).toBeInTheDocument();
      expect(screen.getByText(/^Veículo Rabecão .*10 min de intervalo/)).toBeInTheDocument();
      expect(screen.getByText(/^Motorista #5.*11 min de intervalo/)).toBeInTheDocument();
      expect(screen.getByText(/^Equipe #9.*12 min de intervalo/)).toBeInTheDocument();
      expect(screen.getByText(/^Integrante #12: reserva de \d{2}\/\d{2},? \d{2}:\d{2} a \d{2}\/\d{2},? \d{2}:\d{2} \(15 min de intervalo\)$/))
        .toBeInTheDocument();
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
      const atualizar = vi.fn().mockResolvedValue(undefined);
      const { onAgendada } = abrir(atualizar);
      fireEvent.change(screen.getByLabelText(/Início previsto/), { target: { value: daquiA(2) } });
      fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: daquiA(3) } });
      await userEvent.click(screen.getByRole('button', { name: 'Agendar coleta' }));

      await waitFor(() => expect(atualizar).toHaveBeenCalled());
      expect(veiculosApi.listarOcupacaoSvo).toHaveBeenCalledTimes(2);
      expect(
        await screen.findByText('O veículo já está reservado nesse período.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirmar agendamento' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Estou ciente/)).not.toBeInTheDocument();
      expect(onAgendada).not.toHaveBeenCalled();
    });
  });
});
