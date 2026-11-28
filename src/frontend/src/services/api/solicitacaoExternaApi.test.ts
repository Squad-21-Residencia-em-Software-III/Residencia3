import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, tokenStorage } from './http'
import { ESTADOS_PUBLICOS, normalizarConsulta, solicitacaoExternaApi } from './solicitacaoExternaApi'

const resposta = (status: number, corpo: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
  headers: { get: () => null },
})

/** Resposta válida no formato do backend (SCRUM-266), em snake_case. */
const valida = {
  protocolo: 'SVO-20261127-ABCDEF123456',
  status: 'RECEBIDA',
  mensagem_publica: 'Recebemos o seu chamado.',
  atualizada_em: '2026-11-27T15:00:00.000Z',
  consulta_disponivel_ate: '2026-12-27T15:00:00.000Z',
}

describe('solicitacaoExternaApi.consultar (contrato SCRUM-266)', () => {
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

  it('envia protocolo e credencial no corpo, para o endpoint de acompanhamento, sem nada na URL e de forma pública', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, valida))

    await solicitacaoExternaApi.consultar('SVO-20261127-ABCDEF123456', 'credencial-ficticia')

    const [url, opcoes] = fetchMock.mock.calls[0] as [
      URL,
      { method: string; body: string; credentials: string; headers: Record<string, string> },
    ]
    expect(url.pathname).toMatch(/\/solicitacoes-svo\/externas\/acompanhamento$/)
    expect(url.search).toBe('')
    expect(String(url)).not.toContain('credencial-ficticia')
    expect(opcoes.method).toBe('POST')
    expect(JSON.parse(opcoes.body)).toEqual({ protocolo: 'SVO-20261127-ABCDEF123456', credencial: 'credencial-ficticia' })
    expect(opcoes.credentials).toBe('omit')
    expect(opcoes.headers.Authorization).toBeUndefined()
  })

  it('converte a resposta do backend para os nomes usados na tela', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ...valida, status: 'CONFIRMADA' }))

    const consulta = await solicitacaoExternaApi.consultar('SVO-20261127-ABCDEF123456', 'x')

    expect(consulta).toEqual({
      protocolo: 'SVO-20261127-ABCDEF123456',
      estado: 'CONFIRMADA',
      mensagemPublica: 'Recebemos o seu chamado.',
      atualizadoEm: '2026-11-27T15:00:00.000Z',
      expiraEm: '2026-12-27T15:00:00.000Z',
    })
  })

  it('descarta campos internos e extras do contrato que a API mandar por engano', async () => {
    fetchMock.mockResolvedValueOnce(
      resposta(200, {
        ...valida,
        status: 'EM_ANDAMENTO',
        status_label: 'Em andamento',
        versao_dados: 3,
        permite_editar_contato_local: true,
        cancelamento: { solicitado: false },
        motorista: 'Motorista Interno',
        equipe: 'Equipe 3',
        veiculo: 'ABC1D23',
        gps: { lat: 1, lng: 2 },
      }),
    )

    const consulta = await solicitacaoExternaApi.consultar('SVO-20261127-ABCDEF123456', 'x')

    expect(Object.keys(consulta).sort()).toEqual(['atualizadoEm', 'estado', 'expiraEm', 'mensagemPublica', 'protocolo'])
    expect(JSON.stringify(consulta)).not.toMatch(/Motorista Interno|ABC1D23|Equipe 3|versao_dados/)
  })

  it('estado desconhecido vira erro de servidor (não inventa estado)', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ...valida, status: 'ESTADO_NOVO' }))

    await expect(solicitacaoExternaApi.consultar('X', 'x')).rejects.toMatchObject({ status: 502 })
  })

  it.each([401, 404, 410])('propaga o erro %s da API sem interpretar o motivo', async (status) => {
    fetchMock.mockResolvedValueOnce(resposta(status, { erro: 'Não encontrado' }))

    const erro = await solicitacaoExternaApi.consultar('X', 'y').catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ApiError)
    expect((erro as ApiError).status).toBe(status)
  })
})

describe('normalizarConsulta', () => {
  it('lista exatamente os sete estados públicos do backend', () => {
    expect([...ESTADOS_PUBLICOS]).toEqual([
      'RECEBIDA',
      'EM_ANALISE',
      'CONFIRMADA',
      'EM_ANDAMENTO',
      'CONCLUIDA',
      'NAO_ACOLHIDA',
      'CANCELADA',
    ])
  })

  it.each(ESTADOS_PUBLICOS)('aceita o estado %s', (status) => {
    expect(normalizarConsulta({ ...valida, status }).estado).toBe(status)
  })

  it('rejeita os nomes antigos do contrato provisório', () => {
    expect(() => normalizarConsulta({ ...valida, status: 'ACEITA' })).toThrow(ApiError)
    expect(() => normalizarConsulta({ ...valida, status: 'RECUSADA' })).toThrow(ApiError)
    expect(() => normalizarConsulta({ protocolo: 'P-1', estado: 'RECEBIDA' })).toThrow(ApiError)
  })

  it('campos opcionais ausentes ou nulos viram vazio ou null', () => {
    const consulta = normalizarConsulta({ protocolo: 'P-1', status: 'RECEBIDA', consulta_disponivel_ate: null })

    expect(consulta).toEqual({ protocolo: 'P-1', estado: 'RECEBIDA', mensagemPublica: '', atualizadoEm: null, expiraEm: null })
  })

  it('rejeita resposta sem protocolo, vazia ou que não seja um objeto', () => {
    expect(() => normalizarConsulta({ status: 'RECEBIDA' })).toThrow(ApiError)
    expect(() => normalizarConsulta({ protocolo: '  ', status: 'RECEBIDA' })).toThrow(ApiError)
    expect(() => normalizarConsulta(null)).toThrow(ApiError)
    expect(() => normalizarConsulta(undefined)).toThrow(ApiError)
    expect(() => normalizarConsulta('RECEBIDA')).toThrow(ApiError)
    expect(() => normalizarConsulta([valida])).toThrow(ApiError)
  })

  it('rejeita tipos errados nos campos recebidos', () => {
    expect(() => normalizarConsulta({ ...valida, protocolo: 123 })).toThrow(ApiError)
    expect(() => normalizarConsulta({ ...valida, mensagem_publica: { texto: 'x' } })).toThrow(ApiError)
    expect(() => normalizarConsulta({ ...valida, atualizada_em: 1764255600000 })).toThrow(ApiError)
  })

  it('rejeita datas inválidas', () => {
    expect(() => normalizarConsulta({ ...valida, atualizada_em: 'ontem' })).toThrow(ApiError)
    expect(() => normalizarConsulta({ ...valida, consulta_disponivel_ate: '31/02/2026' })).toThrow(ApiError)
  })

  it('o erro de resposta inesperada tem status 502 e não repete o conteúdo recebido', () => {
    const erro = (() => {
      try {
        normalizarConsulta({ ...valida, status: 'SEGREDO-DO-CIDADAO' })
      } catch (e) {
        return e as ApiError
      }
    })()

    expect(erro?.status).toBe(502)
    expect(erro?.message).not.toContain('SEGREDO-DO-CIDADAO')
  })
})
