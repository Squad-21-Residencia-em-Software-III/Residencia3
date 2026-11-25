import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { encerrarPushAoSair, useVinculoPush } from '../hooks/useVinculoPush'
import { authApi } from '../services/api/authApi'
import { EVENTO_SESSAO_EXPIRADA, tokenStorage } from '../services/api/http'
import type { Perfil, Usuario } from '../types/usuario'
import { invalidarOperacoesPush } from '../utils/operacoesPush'

const CANAL_AUTENTICACAO = 'fsph_auth'

interface AuthContextValue {
  usuario: Usuario | null
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
  const [carregando, setCarregando] = useState(true)
  const canalRef = useRef<BroadcastChannel | null>(null)

  // Cold start / F5: tenta restaurar a sessão em memória usando o cookie HttpOnly de refresh.
  useEffect(() => {
    let cancelado = false
    authApi
      .refresh()
      .then((sessao) => {
        if (cancelado) return
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
    }
  }, [])

  useVinculoPush(usuario?.id)

  const limparEstadoLocal = useCallback(() => {
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
    const resultado = await authApi.login(email, senha)
    invalidarOperacoesPush()
    tokenStorage.set(resultado.token)
    setUsuario(resultado.usuario)
  }, [])

  const logout = useCallback(() => {
    // Antes de limpar: o cancelamento no servidor usa o token desta sessão
    encerrarPushAoSair(tokenStorage.get())
    limparEstadoLocal()
    void authApi.logout().catch(() => {})
    canalRef.current?.postMessage({ tipo: 'LOGOUT' })
  }, [limparEstadoLocal])

  const value = useMemo<AuthContextValue>(
    () => ({
      usuario,
      carregando,
      login,
      logout,
      temPerfil: (...perfis) => usuario !== null && perfis.includes(usuario.perfil),
    }),
    [usuario, carregando, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
