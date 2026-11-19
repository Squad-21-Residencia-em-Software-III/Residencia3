/**
 * Cliente HTTP único do frontend.
 * - Mantém o access token apenas em memória (RAM), nunca no localStorage/sessionStorage.
 * - Envia cookies HttpOnly (refreshToken) via credentials: 'include'.
 * - Converte erros da API ({ erro, detalhes }) em ApiError.
 * - Em 401 com sessão ativa, tenta renovar a sessão silenciosamente via cookie e repete a
 *   requisição uma única vez; se falhar, limpa a memória e dispara "auth:expirada".
 */

const CHAVES_LEGADAS_STORAGE = ['fsph.token', 'fsph.refresh']
const PREFIXO_LEGADO_STORAGE = '@fsph:'
export const EVENTO_SESSAO_EXPIRADA = 'auth:expirada'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

let accessToken: string | null = null

/** Remove tokens ou caches legados que possam ter ficado no navegador de versões anteriores. */
export function limparResiduosArmazenamento(): void {
  const limparStorage = (storage: Storage | undefined) => {
    if (!storage) return
    try {
      for (const chave of CHAVES_LEGADAS_STORAGE) {
        storage.removeItem(chave)
      }
      const chavesParaRemover: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const chave = storage.key(i)
        if (chave && chave.startsWith(PREFIXO_LEGADO_STORAGE)) {
          chavesParaRemover.push(chave)
        }
      }
      for (const chave of chavesParaRemover) {
        storage.removeItem(chave)
      }
    } catch {
      // Ignora ambientes onde o acesso ao Web Storage é bloqueado
    }
  }

  if (typeof window !== 'undefined') {
    limparStorage(window.localStorage)
    limparStorage(window.sessionStorage)
  }
}

// Higiene inicial ao carregar a aplicação
limparResiduosArmazenamento()

export const tokenStorage = {
  get: () => accessToken,
  set: (token: string) => {
    accessToken = token
  },
  clear: () => {
    accessToken = null
    limparResiduosArmazenamento()
  },
}

let renovacaoEmAndamento: Promise<boolean> | null = null

async function renovarSessao(): Promise<boolean> {
  try {
    const resposta = await fetch(new URL(`${BASE_URL}/auth/refresh`, window.location.origin), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
    if (!resposta.ok) return false
    const sessao = (await resposta.json().catch(() => null)) as { token?: string } | null
    if (!sessao?.token) return false
    tokenStorage.set(sessao.token)
    return true
  } catch {
    return false
  }
}

function renovarUmaVez(): Promise<boolean> {
  renovacaoEmAndamento ??= renovarSessao().finally(() => {
    renovacaoEmAndamento = null
  })
  return renovacaoEmAndamento
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
    /** Código de negócio enviado pela API (`codigo`), quando houver. */
    public readonly codigo?: string,
    /** Dados extras do erro (`contexto`), ex.: conflitos de agenda. */
    public readonly contexto?: unknown,
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

/** Mensagem de qualquer erro capturado, pronta para exibir ao usuário. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ApiError) return erro.mensagemCompleta
  return erro instanceof Error ? erro.message : 'Erro inesperado. Tente novamente.'
}

/** `codigo` do ApiError quando a requisição foi cancelada pelo próprio usuário. */
export const CODIGO_CANCELADO = 'REQUISICAO_CANCELADA'

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface Opcoes {
  body?: unknown
  /** Envio de arquivo (multipart). O navegador define o Content-Type com o boundary. */
  formData?: FormData
  /** Permite cancelar a requisição (ex.: envio de foto lento). */
  signal?: AbortSignal
  query?: Record<string, string | number | boolean | undefined>
  /** Login não deve disparar "sessão expirada" quando a senha está errada. */
  semAutenticacao?: boolean
}

export async function request<T>(metodo: Metodo, caminho: string, opcoes: Opcoes = {}): Promise<T> {
  return executar<T>(metodo, caminho, opcoes, true)
}

export interface ResultadoDownload {
  blob: Blob
  filename: string | null
}

function extrairNomeArquivo(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }
  const simpleMatch = /filename="?([^";]+)"?/i.exec(contentDisposition)
  return simpleMatch?.[1]?.trim() ?? null
}

export async function downloadBlob(
  caminho: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<ResultadoDownload> {
  return executarDownload(caminho, query, true)
}

async function executarDownload(
  caminho: string,
  query: Record<string, string | number | boolean | undefined> | undefined,
  podeRenovar: boolean,
): Promise<ResultadoDownload> {
  const url = new URL(`${BASE_URL}${caminho}`, window.location.origin)
  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined && valor !== '') url.searchParams.set(chave, String(valor))
  }

  const headers: Record<string, string> = {}
  const token = tokenStorage.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0)
  }

  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => null)
    if (resposta.status === 401) {
      if (podeRenovar && (await renovarUmaVez())) {
        return executarDownload(caminho, query, false)
      }
      tokenStorage.clear()
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    }
    const semCorpo = dados === null && resposta.status >= 500
    throw new ApiError(
      dados?.erro ??
        (semCorpo ? 'Servidor indisponível. Tente novamente em instantes.' : 'Erro inesperado. Tente novamente.'),
      resposta.status,
      dados?.detalhes ?? [],
      typeof dados?.codigo === 'string' ? dados.codigo : undefined,
      dados?.contexto,
    )
  }

  return {
    blob: await resposta.blob(),
    filename: extrairNomeArquivo(resposta.headers.get('Content-Disposition')),
  }
}

async function executar<T>(
  metodo: Metodo,
  caminho: string,
  opcoes: Opcoes,
  podeRenovar: boolean,
): Promise<T> {
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
      credentials: 'include',
      body: opcoes.formData ?? (opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined),
      signal: opcoes.signal,
    })
  } catch {
    if (opcoes.signal?.aborted) throw new ApiError('O envio foi cancelado.', 0, [], CODIGO_CANCELADO)
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0)
  }

  if (resposta.status === 204) return undefined as T

  const dados = await resposta.json().catch(() => null)

  if (!resposta.ok) {
    if (resposta.status === 401 && !opcoes.semAutenticacao) {
      if (podeRenovar && (await renovarUmaVez())) {
        return executar<T>(metodo, caminho, opcoes, false)
      }
      tokenStorage.clear()
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    }
    const semCorpo = dados === null && resposta.status >= 500
    throw new ApiError(
      dados?.erro ??
        (semCorpo ? 'Servidor indisponível. Tente novamente em instantes.' : 'Erro inesperado. Tente novamente.'),
      resposta.status,
      dados?.detalhes ?? [],
      typeof dados?.codigo === 'string' ? dados.codigo : undefined,
      dados?.contexto,
    )
  }

  return dados as T
}
