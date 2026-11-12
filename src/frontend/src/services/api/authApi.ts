import type { Usuario } from '../../types/usuario'
import { request, tokenStorage } from './http'

export interface ResultadoLogin {
  token: string
  tipo: 'Bearer'
  expiraEm: string
  refreshToken: string
  refreshExpiraEm: string
  usuario: Usuario
}

export const authApi = {
  login: (email: string, senha: string) =>
    request<ResultadoLogin>('POST', '/auth/login', { body: { email, senha }, semAutenticacao: true }),

  me: () => request<Usuario>('GET', '/auth/me'),

  /** A troca invalida as outras sessões; a atual recebe tokens novos, salvos aqui. */
  alterarSenha: async (senhaAtual: string, novaSenha: string) => {
    const sessao = await request<ResultadoLogin>('PATCH', '/auth/senha', { body: { senhaAtual, novaSenha } })
    tokenStorage.set(sessao.token, sessao.refreshToken)
    return sessao
  },
}
