import type { Usuario } from '../../types/usuario'
import { request } from './http'

export interface ResultadoLogin {
  token: string
  tipo: 'Bearer'
  expiraEm: string
  usuario: Usuario
}

export const authApi = {
  login: (email: string, senha: string) =>
    request<ResultadoLogin>('POST', '/auth/login', { body: { email, senha }, semAutenticacao: true }),

  me: () => request<Usuario>('GET', '/auth/me'),

  alterarSenha: (senhaAtual: string, novaSenha: string) =>
    request<void>('PATCH', '/auth/senha', { body: { senhaAtual, novaSenha } }),
}
