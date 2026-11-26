import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { encerrarPushAoSair, useVinculoPush } from '../hooks/useVinculoPush'
import { authApi } from '../services/api/authApi'
import { EVENTO_SESSAO_EXPIRADA, tokenStorage } from '../services/api/http'
import type { Perfil, Usuario } from '../types/usuario'
import { CHAVE_CLIQUE_PUSH } from '../sw/logicaPushSw'
import { suspenderApresentacao } from '../sw/estadoPush'
import { comLimite, invalidarOperacoesPush } from '../utils/operacoesPush'

const CANAL_AUTENTICACAO = 'fsph_auth'
const CHAVE_LOGOUT = 'fsph.auth.logout-pendente'
let logoutEmMemoria = false

function logoutPendente(): boolean {
  try { return localStorage.getItem(CHAVE_LOGOUT) === '1' } catch { return logoutEmMemoria }
}

function marcarLogout(pendente: boolean): void {
  logoutEmMemoria = pendente
  try {
    if (pendente) localStorage.setItem(CHAVE_LOGOUT, '1')
    else localStorage.removeItem(CHAVE_LOGOUT)
  } catch {
    // A aba ainda mantém o logout em memória.
  }
}

function comTravaDeCookie<T>(acao: () => Promise<T>): Promise<T> {
  return navigator.locks?.request('fsph-auth-cookie', acao) ?? acao()
}

async function concluirLogout() {
  if (!logoutPendente()) return
  await comLimite(null, authApi.logout)
  marcarLogout(false)
}

interface AuthContextValue {
  usuario: Usuario | null
  versaoSessao: number
  /** true enquanto a sessão (cookie HttpOnly) está sendo verificada via silent refresh. */
  carregando: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => void
  temPerfil: (...perfis: Perfil[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function criarCanalAutenticacao(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(CANAL_AUTENTICACAO)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [versaoSessao, avancarSessao] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const canalRef = useRef<BroadcastChannel | null>(null)

  // Cold start / F5: tenta restaurar a sessão em memória usando o cookie HttpOnly de refresh.
  useEffect(() => {
    let cancelado = false
    const aoConectar = () => { void comTravaDeCookie(concluirLogout).catch(() => undefined) }
    window.addEventListener('online', aoConectar)
    void comTravaDeCookie(async () => {
      if (logoutPendente()) {
        await concluirLogout()
        return null
      }
      return authApi.refresh()
    })
      .then((sessao) => {
        if (cancelado || !sessao || logoutPendente()) return
        tokenStorage.set(sessao.token)
        setUsuario(sessao.usuario)
      })
      .catch(() => {
        if (cancelado) return
        tokenStorage.clear()
        setUsuario(null)
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
      window.removeEventListener('online', aoConectar)
    }
  }, [])

  useVinculoPush(usuario?.id)

  const limparEstadoLocal = useCallback(() => {
    avancarSessao((versao) => versao + 1)
    invalidarOperacoesPush()
    tokenStorage.clear()
    setUsuario(null)
  }, [])

  // Token expirado/invalidado em qualquer chamada: limpa memória e volta para o login.
  useEffect(() => {
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, limparEstadoLocal)
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, limparEstadoLocal)
  }, [limparEstadoLocal])

  // Sincronização multi-aba: ao deslogar em uma aba, todas as demais encerram a sessão local.
  useEffect(() => {
    const canal = criarCanalAutenticacao()
    canalRef.current = canal
    if (!canal) return

    const aoReceberMensagem = (evento: MessageEvent<{ tipo?: string }>) => {
      if (evento.data?.tipo === 'LOGOUT') {
        limparEstadoLocal()
      }
    }

    canal.addEventListener('message', aoReceberMensagem)
    return () => {
      canal.removeEventListener('message', aoReceberMensagem)
      canal.close()
      if (canalRef.current === canal) canalRef.current = null
    }
  }, [limparEstadoLocal])

  const login = useCallback(async (email: string, senha: string) => {
    const resultado = await comTravaDeCookie(async () => {
      const resultado = await authApi.login(email, senha)
      marcarLogout(false)
      return resultado
    })
    avancarSessao((versao) => versao + 1)
    invalidarOperacoesPush()
    canalRef.current?.postMessage({ tipo: 'LOGOUT' })
    await suspenderApresentacao(false)
    tokenStorage.set(resultado.token)
    setUsuario(resultado.usuario)
  }, [])

  const logout = useCallback(async () => {
    // Antes de limpar: o cancelamento no servidor usa o token desta sessão
    marcarLogout(true)
    invalidarOperacoesPush()
    const encerramento = encerrarPushAoSair(tokenStorage.get())
    try { sessionStorage.removeItem(CHAVE_CLIQUE_PUSH) } catch { /* Armazenamento indisponível. */ }
    canalRef.current?.postMessage({ tipo: 'LOGOUT' })
    void comTravaDeCookie(concluirLogout).catch(() => undefined)
    await encerramento
    limparEstadoLocal()
  }, [limparEstadoLocal])

  const value = useMemo<AuthContextValue>(
    () => ({
      usuario,
      versaoSessao,
      carregando,
      login,
      logout,
      temPerfil: (...perfis) => usuario !== null && perfis.includes(usuario.perfil),
    }),
    [usuario, versaoSessao, carregando, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
