import type { Usuario } from '../../types/usuario'
import { request, tokenStorage } from './http'

export interface ResultadoLogin {
  token: string
  tipo: 'Bearer'
  expiraEm: string
  sessaoExpiraEm?: string
  usuario: Usuario
}

export const authApi = {
  login: (email: string, senha: string) =>
    request<ResultadoLogin>('POST', '/auth/login', { body: { email, senha }, semAutenticacao: true }),

  /** Usa o cookie HttpOnly de refresh para emitir novo access token em memória. */
  refresh: () =>
    request<ResultadoLogin>('POST', '/auth/refresh', { semAutenticacao: true }),

  /** Solicita ao servidor a remoção do cookie HttpOnly de sessão. */
  logout: (signal?: AbortSignal) =>
    request<void>('POST', '/auth/logout', { semAutenticacao: true, signal }),

  me: () => request<Usuario>('GET', '/auth/me'),

  /** A troca invalida as outras sessões; a atual recebe um access token novo. */
  alterarSenha: async (senhaAtual: string, novaSenha: string) => {
    const sessao = await request<ResultadoLogin>('PATCH', '/auth/senha', {
      body: { senhaAtual, novaSenha },
    })
    if (sessao?.token) tokenStorage.set(sessao.token)
    return sessao
  },
}
