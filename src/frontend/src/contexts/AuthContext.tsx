import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { encerrarPushAoSair, useVinculoPush } from '../hooks/useVinculoPush'
import { authApi } from '../services/api/authApi'
import { EVENTO_SESSAO_EXPIRADA, tokenStorage } from '../services/api/http'
import type { Perfil, Usuario } from '../types/usuario'
import { CHAVE_CLIQUE_PUSH } from '../sw/logicaPushSw'
import { suspenderApresentacao } from '../sw/estadoPush'
import { comLimite, invalidarOperacoesPush } from '../utils/operacoesPush'
import { ehRotaPublicaAnonima } from '../utils/rotasPublicas'

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

export function AuthProvider({ children, pathname = window.location.pathname }: { children: ReactNode; pathname?: string }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [versaoSessao, avancarSessao] = useState(0)
  // Página pública aberta a qualquer pessoa: não há sessão a restaurar, então não fica "carregando".
  const [restauracaoPendente, setRestauracaoPendente] = useState(true)
  const carregando = restauracaoPendente && !usuario && !ehRotaPublicaAnonima(pathname)
  const canalRef = useRef<BroadcastChannel | null>(null)
  const geracaoAuth = useRef(0)

  useEffect(() => {
    const aoConectar = () => { void comTravaDeCookie(concluirLogout).catch(() => undefined) }
    window.addEventListener('online', aoConectar)
    if (logoutPendente()) aoConectar()
    return () => window.removeEventListener('online', aoConectar)
  }, [])

  // Cold start / F5: tenta restaurar a sessão em memória usando o cookie HttpOnly de refresh.
  useEffect(() => {
    // Visitante anônimo em página pública (SCRUM-272): não renova sessão nem chama /auth/refresh.
    if (!carregando) return
    let cancelado = false
    const geracao = geracaoAuth.current
    const atual = () => !cancelado && geracaoAuth.current === geracao
    void comTravaDeCookie(async () => {
      if (!atual()) return null
      if (logoutPendente()) {
        await concluirLogout()
        return null
      }
      return comLimite(null, authApi.refresh)
    })
      .then((sessao) => {
        if (!atual() || !sessao || logoutPendente()) return
        tokenStorage.set(sessao.token)
        setUsuario(sessao.usuario)
      })
      .catch(() => {
        if (!atual()) return
        tokenStorage.clear()
        setUsuario(null)
      })
      .finally(() => {
        if (atual()) setRestauracaoPendente(false)
      })
    return () => {
      cancelado = true
    }
  }, [carregando])

  useVinculoPush(usuario?.id)

  const limparEstadoLocal = useCallback(() => {
    geracaoAuth.current += 1
    avancarSessao((versao) => versao + 1)
    invalidarOperacoesPush()
    tokenStorage.clear()
    setRestauracaoPendente(false)
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
    const aoReceberMensagem = (evento: MessageEvent<{ tipo?: string }>) => {
      if (evento.data?.tipo === 'LOGOUT') {
        limparEstadoLocal()
      }
    }

    const aoMudarStorage = (evento: StorageEvent) => {
      if (evento.key === CHAVE_LOGOUT && evento.newValue === '1') limparEstadoLocal()
    }
    canal?.addEventListener('message', aoReceberMensagem)
    window.addEventListener('storage', aoMudarStorage)
    return () => {
      canal?.removeEventListener('message', aoReceberMensagem)
      canal?.close()
      window.removeEventListener('storage', aoMudarStorage)
      if (canalRef.current === canal) canalRef.current = null
    }
  }, [limparEstadoLocal])

  const login = useCallback(async (email: string, senha: string) => {
    const geracao = ++geracaoAuth.current
    const garantirAtual = () => {
      if (geracaoAuth.current !== geracao) throw new Error('A sessão foi encerrada.')
    }
    const resultado = await comTravaDeCookie(async () => {
      garantirAtual()
      const resultado = await comLimite(null, (signal) => authApi.login(email, senha, signal))
      garantirAtual()
      marcarLogout(false)
      return resultado
    })
    avancarSessao((versao) => versao + 1)
    invalidarOperacoesPush()
    canalRef.current?.postMessage({ tipo: 'LOGOUT' })
    await comLimite(null, () => suspenderApresentacao(false)).catch(() => undefined)
    garantirAtual()
    tokenStorage.set(resultado.token)
    setRestauracaoPendente(false)
    setUsuario(resultado.usuario)
  }, [])

  const logout = useCallback(() => {
    // Antes de limpar: o cancelamento no servidor usa o token desta sessão
    marcarLogout(true)
    void encerrarPushAoSair(tokenStorage.get())
    limparEstadoLocal()
    try { sessionStorage.removeItem(CHAVE_CLIQUE_PUSH) } catch { /* Armazenamento indisponível. */ }
    canalRef.current?.postMessage({ tipo: 'LOGOUT' })
    void comTravaDeCookie(concluirLogout).catch(() => undefined)
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
