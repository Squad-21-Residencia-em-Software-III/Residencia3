/**
 * Cliente HTTP único do frontend.
 * - Anexa o token JWT (Authorization: Bearer) em toda requisição.
 * - Converte erros da API ({ erro, detalhes }) em ApiError.
 * - Em 401 com sessão ativa, limpa o token e avisa a aplicação (evento "auth:expirada").
 */

const TOKEN_KEY = 'fsph.token'
export const EVENTO_SESSAO_EXPIRADA = 'auth:expirada'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export interface DetalheErro {
  campo: string
  mensagem: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detalhes: DetalheErro[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Mensagem pronta para exibir ao usuário (inclui o primeiro detalhe de validação). */
  get mensagemCompleta(): string {
    const primeiro = this.detalhes[0]
    return primeiro ? `${primeiro.mensagem}` : this.message
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface Opcoes {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Login não deve disparar "sessão expirada" quando a senha está errada. */
  semAutenticacao?: boolean
}

export async function request<T>(metodo: Metodo, caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${caminho}`, window.location.origin)
  for (const [chave, valor] of Object.entries(opcoes.query ?? {})) {
    if (valor !== undefined && valor !== '') url.searchParams.set(chave, String(valor))
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opcoes.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenStorage.get()
  if (token && !opcoes.semAutenticacao) headers.Authorization = `Bearer ${token}`

  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers,
      body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0)
  }

  if (resposta.status === 204) return undefined as T

  const dados = await resposta.json().catch(() => null)

  if (!resposta.ok) {
    if (resposta.status === 401 && !opcoes.semAutenticacao) {
      tokenStorage.clear()
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    }
  const semCorpo = dados === null && resposta.status >= 500
throw new ApiError(
  dados?.erro ??
    (semCorpo ? 'Servidor indisponível. Tente novamente em instantes.' : 'Erro inesperado. Tente novamente.'),
  resposta.status,
  dados?.detalhes ?? [],
)
  }

  return dados as T
}
