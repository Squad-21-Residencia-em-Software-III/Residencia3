import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, EVENTO_SESSAO_EXPIRADA, request, tokenStorage } from './http'

const resposta = (status: number, corpo: unknown = {}, cabecalhos: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
  headers: { get: (nome: string) => cabecalhos[nome] ?? null },
})

const init = (chamada: unknown[]) =>
  chamada[1] as { headers: Record<string, string>; credentials?: RequestCredentials; cache?: RequestCache }

describe('http: requisição pública (visitante anônimo)', () => {
  const fetchMock = vi.fn()
  globalThis.fetch = fetchMock

  beforeEach(() => {
    vi.clearAllMocks()
    tokenStorage.clear()
  })

  it('não envia token nem cookies e não usa cache', async () => {
    tokenStorage.set('token-de-outra-sessao')
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true }))

    await request('POST', '/publico', { body: { a: 1 }, publico: true })

    const { headers, credentials, cache } = init(fetchMock.mock.calls[0])
    expect(headers.Authorization).toBeUndefined()
    expect(credentials).toBe('omit')
    expect(cache).toBe('no-store')
  })

  it('em 401 não tenta renovar a sessão nem avisa "sessão expirada"', async () => {
    const aoExpirar = vi.fn()
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
    fetchMock.mockResolvedValueOnce(resposta(401, { erro: 'Credencial inválida' }))

    await expect(request('POST', '/publico', { publico: true })).rejects.toBeInstanceOf(ApiError)

    expect(fetchMock).toHaveBeenCalledTimes(1) // sem chamada a /auth/refresh
    expect(aoExpirar).not.toHaveBeenCalled()
    window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
  })

  it('repassa cabeçalhos extras (ex.: chave de idempotência)', async () => {
    fetchMock.mockResolvedValueOnce(resposta(201, {}))

    await request('POST', '/publico', { publico: true, headers: { 'Idempotency-Key': 'chave-1' } })

    expect(init(fetchMock.mock.calls[0]).headers['Idempotency-Key']).toBe('chave-1')
  })

  it('expõe o Retry-After do servidor em erros 429', async () => {
    fetchMock.mockResolvedValueOnce(resposta(429, { erro: 'Muitas tentativas' }, { 'Retry-After': '7' }))

    const erro = await request('POST', '/publico', { publico: true }).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ApiError)
    expect((erro as ApiError).status).toBe(429)
    expect((erro as ApiError).retryAfterSegundos).toBe(7)
  })

  it('sem Retry-After (ou sem cabeçalhos na resposta), retryAfterSegundos fica indefinido', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ erro: 'x' }) })

    const erro = await request('POST', '/publico', { publico: true }).catch((e: unknown) => e)

    expect((erro as ApiError).retryAfterSegundos).toBeUndefined()
  })
})
