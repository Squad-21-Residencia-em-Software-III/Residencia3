import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/api/http'
import { ESTADOS_PUBLICOS, solicitacaoExternaApi } from '../../services/api/solicitacaoExternaApi'
import type { ConsultaPublica, EstadoPublico } from '../../services/api/solicitacaoExternaApi'
import AcompanharSolicitacaoPage from './AcompanharSolicitacaoPage'

vi.mock('../../services/api/solicitacaoExternaApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/api/solicitacaoExternaApi')>()),
  solicitacaoExternaApi: { consultar: vi.fn() },
}))

const consultar = vi.mocked(solicitacaoExternaApi.consultar)

const SEGREDO = 'segredo-so-de-teste'

const andamento: ConsultaPublica = {
  protocolo: 'DEMO-0004',
  estado: 'EM_ANDAMENTO',
  mensagemPublica: 'Atendimento em andamento (dado fictício).',
  atualizadoEm: '2026-11-27T15:00:00.000Z',
  expiraEm: null,
}

/** Os sete estados públicos e o selo que cada um mostra na tela (lista provisória do SCRUM-266). */
const CASOS_ESTADOS: [EstadoPublico, string][] = [
  ['RECEBIDA', 'Recebida'],
  ['EM_ANALISE', 'Em análise'],
  ['ACEITA', 'Aceita'],
  ['EM_ANDAMENTO', 'Em andamento'],
  ['CONCLUIDA', 'Concluída'],
  ['RECUSADA', 'Não atendida'],
  ['CANCELADA', 'Cancelada'],
]

async function preencher(user: ReturnType<typeof userEvent.setup>, protocolo = 'DEMO-0004', segredo = SEGREDO) {
  await user.type(screen.getByLabelText('Protocolo'), protocolo)
  await user.type(screen.getByLabelText('Segredo'), segredo)
}

describe('AcompanharSolicitacaoPage (SCRUM-267)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('consulta e mostra o estado com a mensagem pública', async () => {
    consultar.mockResolvedValueOnce(andamento)
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(await screen.findByText('Em andamento')).toBeInTheDocument()
    expect(screen.getByText('DEMO-0004')).toBeInTheDocument()
    expect(screen.getByText('Atendimento em andamento (dado fictício).')).toBeInTheDocument()
    expect(consultar).toHaveBeenCalledWith('DEMO-0004', SEGREDO, expect.any(AbortSignal))
  })

  it('os casos de estado cobrem exatamente os estados públicos do contrato', () => {
    expect(CASOS_ESTADOS.map(([estado]) => estado).sort()).toEqual([...ESTADOS_PUBLICOS].sort())
    expect(CASOS_ESTADOS).toHaveLength(7)
  })

  it.each(CASOS_ESTADOS)('mostra o estado %s com o selo "%s"', async (estado, rotulo) => {
    consultar.mockResolvedValueOnce({ ...andamento, estado })
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(await screen.findByText(rotulo)).toBeInTheDocument()
  })

  it('pede o preenchimento sem chamar a API quando falta protocolo ou segredo', async () => {
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await user.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(await screen.findByText('Informe o protocolo e o segredo para consultar.')).toBeInTheDocument()
    expect(consultar).not.toHaveBeenCalled()
  })

  it('credencial inválida mostra erro genérico e nenhum resultado', async () => {
    consultar.mockRejectedValueOnce(new ApiError('Não encontrado', 404))
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(await screen.findByText(/Protocolo ou segredo inválidos/)).toBeInTheDocument()
    expect(screen.queryByText('Em andamento')).not.toBeInTheDocument()
  })

  it('credencial expirada (410) tem mensagem própria', async () => {
    consultar.mockRejectedValueOnce(new ApiError('Expirada', 410))
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(await screen.findByText(/expirou/)).toBeInTheDocument()
  })

  it('429 bloqueia o botão pelo tempo pedido pelo servidor', async () => {
    consultar.mockRejectedValueOnce(new ApiError('Muitas tentativas', 429, [], undefined, undefined, 9))
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))

    const botao = await screen.findByRole('button', { name: /Aguarde 9s/ })
    expect(botao).toBeDisabled()
  })

  it('indisponibilidade oferece "Tentar novamente" e refaz a consulta', async () => {
    consultar.mockRejectedValueOnce(new ApiError('Servidor indisponível', 503)).mockResolvedValueOnce(andamento)
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Em andamento')).toBeInTheDocument()
    expect(consultar).toHaveBeenCalledTimes(2)
  })

  it('falha de conexão (status 0) mostra mensagem de conexão', async () => {
    consultar.mockRejectedValueOnce(new ApiError('Não foi possível conectar', 0))
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))

    expect(await screen.findByText(/Verifique sua conexão/)).toBeInTheDocument()
  })

  it('trocar o protocolo ou o segredo limpa o resultado que estava na tela', async () => {
    consultar.mockResolvedValueOnce(andamento)
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await screen.findByText('Em andamento')

    await user.type(screen.getByLabelText('Segredo'), 'x')

    expect(screen.queryByText('Em andamento')).not.toBeInTheDocument()
  })

  it('ignora a resposta de uma consulta antiga depois que o segredo mudou', async () => {
    let resolverAntiga: (valor: ConsultaPublica) => void = () => undefined
    consultar.mockReturnValueOnce(new Promise<ConsultaPublica>((resolve) => (resolverAntiga = resolve)))
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await user.type(screen.getByLabelText('Segredo'), 'outro') // muda a credencial durante a consulta
    resolverAntiga(andamento)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Consultar' })).toBeEnabled())
    expect(screen.queryByText('Em andamento')).not.toBeInTheDocument()
  })

  it('protege contra duplo clique: uma consulta por vez', async () => {
    consultar.mockReturnValueOnce(new Promise<ConsultaPublica>(() => undefined))
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    const botao = screen.getByRole('button', { name: 'Consultar' })
    await user.dblClick(botao)

    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it('não guarda o segredo em storage nem na URL', async () => {
    consultar.mockResolvedValueOnce(andamento)
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await screen.findByText('Em andamento')

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(window.location.href).not.toContain(SEGREDO)
    expect(window.location.search).toBe('')
  })

  it('mostra só campos públicos, mesmo que a resposta traga dados internos', async () => {
    consultar.mockResolvedValueOnce({
      ...andamento,
      motorista: 'Motorista Interno',
      veiculo: 'ABC1D23',
    } as ConsultaPublica)
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await screen.findByText('Em andamento')

    expect(screen.queryByText(/Motorista Interno/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ABC1D23/)).not.toBeInTheDocument()
  })

  it('"Nova consulta" limpa protocolo, segredo e resultado', async () => {
    consultar.mockResolvedValueOnce(andamento)
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    await preencher(user)
    await user.click(screen.getByRole('button', { name: 'Consultar' }))
    await user.click(await screen.findByRole('button', { name: 'Nova consulta' }))

    expect(screen.getByLabelText('Protocolo')).toHaveValue('')
    expect(screen.getByLabelText('Segredo')).toHaveValue('')
    expect(screen.queryByText('Em andamento')).not.toBeInTheDocument()
  })

  it('o segredo fica oculto e só aparece quando a pessoa pede', async () => {
    const user = userEvent.setup()
    render(<AcompanharSolicitacaoPage />)

    expect(screen.getByLabelText('Segredo')).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar segredo' }))
    expect(screen.getByLabelText('Segredo')).toHaveAttribute('type', 'text')
  })
})
