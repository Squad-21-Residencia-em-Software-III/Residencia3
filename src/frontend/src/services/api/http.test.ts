import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVENTO_SESSAO_EXPIRADA,
  limparResiduosArmazenamento,
  request,
  tokenStorage,
} from './http'

const resposta = (status: number, corpo: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
})

const autorizacao = (chamada: unknown[]) =>
  (chamada[1] as { headers: Record<string, string> }).headers.Authorization

const credenciais = (chamada: unknown[]) =>
  (chamada[1] as { credentials?: RequestCredentials }).credentials

describe('http: token em memória e silent refresh via cookie HttpOnly', () => {
  const fetchMock = vi.fn()
  globalThis.fetch = fetchMock

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    tokenStorage.clear()
  })

  it('mantém o access token apenas em memória, sem gravar no localStorage ou sessionStorage', () => {
    tokenStorage.set('token-em-ram')

    expect(tokenStorage.get()).toBe('token-em-ram')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('remove resíduos legados de tokens e chaves @fsph:* do localStorage e sessionStorage', () => {
    localStorage.setItem('fsph.token', 'velho-access')
    localStorage.setItem('fsph.refresh', 'velho-refresh')
    localStorage.setItem('@fsph:usuarios', '[]')
    sessionStorage.setItem('@fsph:agenda', '{}')
    localStorage.setItem('preferencia-ui', 'claro')

    limparResiduosArmazenamento()

    expect(localStorage.getItem('fsph.token')).toBeNull()
    expect(localStorage.getItem('fsph.refresh')).toBeNull()
    expect(localStorage.getItem('@fsph:usuarios')).toBeNull()
    expect(sessionStorage.getItem('@fsph:agenda')).toBeNull()
    // Preferências comuns sem relação não são removidas
    expect(localStorage.getItem('preferencia-ui')).toBe('claro')
  })

  it('envia credentials: include e Bearer token nas requisições autenticadas', async () => {
    tokenStorage.set('access-ativo')
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true }))

    await expect(request('GET', '/veiculos')).resolves.toEqual({ ok: true })

    expect(credenciais(fetchMock.mock.calls[0]!)).toBe('include')
    expect(autorizacao(fetchMock.mock.calls[0]!)).toBe('Bearer access-ativo')
  })

  it('renova a sessão via cookie no 401 e repete a requisição com o novo token', async () => {
    tokenStorage.set('access-expirado')
    fetchMock
      .mockResolvedValueOnce(resposta(401, { erro: 'Token inválido ou expirado' }))
      .mockResolvedValueOnce(resposta(200, { token: 'access-novo' }))
      .mockResolvedValueOnce(resposta(200, { id: 1 }))

    await expect(request('GET', '/veiculos')).resolves.toEqual({ id: 1 })

    const chamadaRefresh = fetchMock.mock.calls[1]!
    expect(String(chamadaRefresh[0])).toContain('/auth/refresh')
    expect(credenciais(chamadaRefresh)).toBe('include')
    expect((chamadaRefresh[1] as { body?: string }).body).toBeUndefined()
    expect(autorizacao(fetchMock.mock.calls[2]!)).toBe('Bearer access-novo')
    expect(tokenStorage.get()).toBe('access-novo')
  })

  it('faz uma única renovação para requisições simultâneas que recebem 401', async () => {
    tokenStorage.set('access-expirado')
    fetchMock.mockImplementation(async (url: URL, init: { headers: Record<string, string> }) => {
      if (String(url).includes('/auth/refresh')) return resposta(200, { token: 'access-novo' })
      return init.headers.Authorization === 'Bearer access-novo'
        ? resposta(200, { ok: true })
        : resposta(401)
    })

    await Promise.all([request('GET', '/veiculos'), request('GET', '/motoristas')])

    const renovacoes = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'))
    expect(renovacoes).toHaveLength(1)
  })

  it('limpa a memória e dispara EVENTO_SESSAO_EXPIRADA quando a renovação falha', async () => {
    tokenStorage.set('access-expirado')
    const aoExpirar = vi.fn()
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
    fetchMock.mockResolvedValueOnce(resposta(401)).mockResolvedValueOnce(resposta(401))

    await expect(request('GET', '/veiculos')).rejects.toMatchObject({ status: 401 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(tokenStorage.get()).toBeNull()
    expect(aoExpirar).toHaveBeenCalledTimes(1)
    window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
  })

  it('não repete a requisição mais de uma vez se o novo token também receber 401', async () => {
    tokenStorage.set('access-expirado')
    fetchMock
      .mockResolvedValueOnce(resposta(401))
      .mockResolvedValueOnce(resposta(200, { token: 'access-novo' }))
      .mockResolvedValueOnce(resposta(401))

    await expect(request('GET', '/veiculos')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(tokenStorage.get()).toBeNull()
  })

  it('não tenta renovar em requisições semAutenticacao (como o login)', async () => {
    tokenStorage.set('access-previo')
    fetchMock.mockResolvedValueOnce(resposta(401, { erro: 'E-mail ou senha inválidos' }))

    await expect(
      request('POST', '/auth/login', { body: {}, semAutenticacao: true }),
    ).rejects.toMatchObject({ status: 401 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tokenStorage.get()).toBe('access-previo')
  })
})
