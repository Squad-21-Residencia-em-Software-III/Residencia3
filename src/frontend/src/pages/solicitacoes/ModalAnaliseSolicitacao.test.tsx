import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { solicitacoesApi } from '../../services/api/solicitacoesApi'
import type { DisponibilidadeSolicitacao, SolicitacaoViagem } from '../../types/solicitacao'
import { ModalAnaliseSolicitacao } from './ModalAnaliseSolicitacao'

vi.mock('../../services/api/solicitacoesApi', () => ({
  solicitacoesApi: { consultarDisponibilidade: vi.fn() },
}))

const consultarDisponibilidade = vi.mocked(solicitacoesApi.consultarDisponibilidade)

const solicitacao: SolicitacaoViagem = {
  id: 7,
  solicitante_id: 1,
  solicitante_nome: 'Maria Souza',
  origem: 'Sede',
  destino: 'Unidade Norte',
  finalidade: 'Reunião institucional',
  data_saida_desejada: '2026-11-20T08:00:00',
  data_chegada_desejada: '2026-11-20T18:00:00',
  status: 'PENDENTE_APROVACAO',
  unidade_nome: 'Unidade Central',
}

const disponibilidadeComVeiculos: DisponibilidadeSolicitacao = {
  veiculos_disponiveis: [
    { id: 1, placa: 'ABC1D23', modelo: 'Fiat Doblò', capacidade_maxima: 7, status: 'DISPONIVEL' },
    { id: 2, placa: 'EFG4H56', modelo: 'Renault Master', capacidade_maxima: 15, status: 'DISPONIVEL' },
  ],
  motoristas_disponiveis: [{ id: 10 }],
}

function renderizarModal(podeDecidir = true) {
  return render(
    <ModalAnaliseSolicitacao
      solicitacao={solicitacao}
      podeDecidir={podeDecidir}
      onClose={vi.fn()}
      onAprovar={vi.fn().mockResolvedValue(undefined)}
      onRecusar={vi.fn().mockResolvedValue(undefined)}
    />
  )
}

describe('ModalAnaliseSolicitacao - disponibilidade de veículos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista os veículos disponíveis no período com modelo e capacidade', async () => {
    consultarDisponibilidade.mockResolvedValue(disponibilidadeComVeiculos)

    renderizarModal()

    expect(await screen.findByText('Veículos disponíveis no período')).toBeInTheDocument()
    expect(screen.getByText('Fiat Doblò')).toBeInTheDocument()
    expect(screen.getByText('Renault Master')).toBeInTheDocument()
    expect(screen.getByText('7 lugares')).toBeInTheDocument()
    expect(screen.getByText('15 lugares')).toBeInTheDocument()
    expect(consultarDisponibilidade).toHaveBeenCalledWith(7)
  })

  it('exibe o aviso de carregamento durante a consulta e o remove ao final', async () => {
    let resolver: (valor: DisponibilidadeSolicitacao) => void = () => {}
    consultarDisponibilidade.mockReturnValue(
      new Promise<DisponibilidadeSolicitacao>((resolve) => {
        resolver = resolve
      })
    )

    renderizarModal()

    expect(await screen.findByText(/Consultando disponibilidade no período/)).toBeInTheDocument()

    resolver(disponibilidadeComVeiculos)

    await waitFor(() =>
      expect(screen.queryByText(/Consultando disponibilidade no período/)).not.toBeInTheDocument()
    )
    expect(screen.getByText('Fiat Doblò')).toBeInTheDocument()
  })

  it('informa quando não há veículos disponíveis para o período', async () => {
    consultarDisponibilidade.mockResolvedValue({
      veiculos_disponiveis: [],
      motoristas_disponiveis: [],
    })

    renderizarModal()

    expect(
      await screen.findByText('Nenhum veículo disponível para o período solicitado.')
    ).toBeInTheDocument()
  })

  it('mostra o erro, mantém as ações e permite tentar novamente', async () => {
    const user = userEvent.setup()
    consultarDisponibilidade
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce(disponibilidadeComVeiculos)

    renderizarModal()

    expect(
      await screen.findByText(/Não foi possível consultar a disponibilidade: Falha de rede/)
    ).toBeInTheDocument()
    expect(screen.queryByText('Nenhum veículo disponível para o período solicitado.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aprovar Solicitação/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Recusar/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Fiat Doblò')).toBeInTheDocument()
    expect(consultarDisponibilidade).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Não foi possível consultar a disponibilidade/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
  })

  it('para quem não decide (ex.: Gestor SVO) é só consulta: sem disponibilidade nem Aprovar/Recusar', () => {
    renderizarModal(false)

    expect(consultarDisponibilidade).not.toHaveBeenCalled()
    expect(screen.queryByText('Veículos disponíveis no período')).not.toBeInTheDocument()
    expect(screen.queryByText(/Consultando disponibilidade/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Recusar/ })).not.toBeInTheDocument()
  })
})
