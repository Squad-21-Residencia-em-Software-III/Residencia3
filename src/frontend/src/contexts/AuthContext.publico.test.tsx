import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { authApi } from '../services/api/authApi'
import { tokenStorage } from '../services/api/http'

vi.mock('../hooks/useVinculoPush', () => ({ encerrarPushAoSair: vi.fn(), useVinculoPush: vi.fn() }))

vi.mock('../services/api/authApi', () => ({
  authApi: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    alterarSenha: vi.fn(),
  },
}))

function Consumidor() {
  const { usuario, carregando } = useAuth()
  if (carregando) return <span>Carregando...</span>
  return <span>{usuario ? usuario.nome : 'Deslogado'}</span>
}

describe('AuthContext em páginas públicas (visitante anônimo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tokenStorage.clear()
    localStorage.clear()
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
    vi.mocked(authApi.refresh).mockRejectedValue(new Error('sem sessão'))
  })

  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('em /acompanhar não chama /auth/refresh e já aparece como deslogado', () => {
    window.history.pushState({}, '', '/acompanhar')

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>,
    )

    expect(screen.getByText('Deslogado')).toBeInTheDocument()
    expect(authApi.refresh).not.toHaveBeenCalled()
  })

  it('restaura a sessão ao sair de uma página pública por navegação interna', async () => {
    const { rerender } = render(<AuthProvider pathname="/acompanhar"><Consumidor /></AuthProvider>)
    expect(authApi.refresh).not.toHaveBeenCalled()
    rerender(<AuthProvider pathname="/inicio"><Consumidor /></AuthProvider>)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Deslogado')).toBeInTheDocument())
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
    rerender(<AuthProvider pathname="/acompanhar"><Consumidor /></AuthProvider>)
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
  })

  it('em página comum continua tentando restaurar a sessão', async () => {
    window.history.pushState({}, '', '/inicio')

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('Deslogado')).toBeInTheDocument())
    expect(authApi.refresh).toHaveBeenCalledTimes(1)
  })
})
