import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, tokenStorage } from './http'
import { ESTADOS_PUBLICOS, normalizarConsulta, solicitacaoExternaApi } from './solicitacaoExternaApi'

const resposta = (status: number, corpo: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
  headers: { get: () => null },
})

describe('solicitacaoExternaApi.consultar (contrato provisório)', () => {
  const fetchMock = vi.fn()
  globalThis.fetch = fetchMock

  beforeEach(() => {
    vi.clearAllMocks()
    tokenStorage.clear()
    // O .env.local de quem roda pode ter o mock ligado; aqui o teste sempre usa o fetch simulado.
    vi.stubEnv('VITE_SOLICITACAO_EXTERNA_MOCK', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('envia protocolo e segredo no corpo, sem nada na URL, e de forma pública', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { protocolo: 'DEMO-1', estado: 'RECEBIDA' }))

    await solicitacaoExternaApi.consultar('DEMO-1', 'segredo-ficticio')

    const [url, opcoes] = fetchMock.mock.calls[0] as [URL, { body: string; credentials: string; headers: Record<string, string> }]
    expect(url.search).toBe('')
    expect(String(url)).not.toContain('segredo-ficticio')
    expect(JSON.parse(opcoes.body)).toEqual({ protocolo: 'DEMO-1', segredo: 'segredo-ficticio' })
    expect(opcoes.credentials).toBe('omit')
    expect(opcoes.headers.Authorization).toBeUndefined()
  })

  it('descarta campos internos que a API mandar por engano', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, {
        protocolo: 'DEMO-2',
        estado: 'EM_ANDAMENTO',
        mensagemPublica: 'Em atendimento',
        motorista: 'Motorista Interno',
        equipe: 'Equipe 3',
        veiculo: 'ABC1D23',
        gps: { lat: 1, lng: 2 },
      }),
    )

    const consulta = await solicitacaoExternaApi.consultar('DEMO-2', 'x')

    expect(Object.keys(consulta).sort()).toEqual(['atualizadoEm', 'estado', 'expiraEm', 'mensagemPublica', 'protocolo'])
    expect(JSON.stringify(consulta)).not.toContain('Motorista Interno')
  })

  it('estado desconhecido vira erro de servidor (não inventa estado)', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { protocolo: 'DEMO-3', estado: 'ESTADO_NOVO' }))

    await expect(solicitacaoExternaApi.consultar('DEMO-3', 'x')).rejects.toMatchObject({ status: 502 })
  })

  it('propaga o erro da API (ex.: 404 de credencial)', async () => {
    fetchMock.mockResolvedValueOnce(resposta(404, { erro: 'Não encontrado' }))

    await expect(solicitacaoExternaApi.consultar('X', 'y')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('normalizarConsulta', () => {
  it.each(ESTADOS_PUBLICOS)('aceita o estado %s', (estado) => {
    expect(normalizarConsulta({ protocolo: 'P-1', estado }).estado).toBe(estado)
  })

  it('rejeita resposta sem protocolo ou vazia', () => {
    expect(() => normalizarConsulta({ estado: 'RECEBIDA' })).toThrow(ApiError)
    expect(() => normalizarConsulta(null)).toThrow(ApiError)
  })
})
