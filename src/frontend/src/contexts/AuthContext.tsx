import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '../services/api/authApi'
import { EVENTO_SESSAO_EXPIRADA, tokenStorage } from '../services/api/http'
import type { Perfil, Usuario } from '../types/usuario'

interface AuthContextValue {
  usuario: Usuario | null
  /** true enquanto a sessão salva (token) está sendo verificada na API. */
  carregando: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => void
  temPerfil: (...perfis: Perfil[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(() => tokenStorage.get() !== null)

  // Restaura a sessão ao abrir/recarregar a página.
  useEffect(() => {
    if (!tokenStorage.get()) return
    let cancelado = false
    authApi
      .me()
      .then((u) => !cancelado && setUsuario(u))
      .catch(() => tokenStorage.clear())
      .finally(() => !cancelado && setCarregando(false))
    return () => {
      cancelado = true
    }
  }, [])

  // Token expirado/invalidado em qualquer chamada: volta para o login.
  useEffect(() => {
    const aoExpirar = () => setUsuario(null)
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
  }, [])

  const login = useCallback(async (email: string, senha: string) => {
    const resultado = await authApi.login(email, senha)
    tokenStorage.set(resultado.token)
    setUsuario(resultado.usuario)
  }, [])

  const logout = useCallback(() => {
    tokenStorage.clear()
    setUsuario(null)
  }, [])

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
