import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { authApi } from '../services/api/authApi'
import { tokenStorage } from '../services/api/http'
import { PERFIS } from '../types/usuario'

vi.mock('../services/api/authApi', () => ({
  authApi: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    alterarSenha: vi.fn(),
  },
}))

const mockUsuario = {
  id: 1,
  nome: 'Gestor Teste',
  email: 'gestor@fsph.se.gov.br',
  perfil: PERFIS.GESTOR_FROTA,
  ativo: true,
}

function ConsumidorTeste() {
  const { usuario, carregando, logout } = useAuth()
  if (carregando) return <span>Carregando...</span>
  return (
    <div>
      <span>{usuario ? usuario.nome : 'Deslogado'}</span>
      <button type="button" onClick={logout}>
        Sair
      </button>
    </div>
  )
}

describe('AuthContext: cold start via silent refresh e logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tokenStorage.clear()
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
  })

  it('restaura a sessão em memória via authApi.refresh no cold start', async () => {
    vi.mocked(authApi.refresh).mockResolvedValueOnce({
      token: 'novo-token-ram',
      tipo: 'Bearer',
      expiraEm: '2h',
      usuario: mockUsuario,
    })

    render(
      <AuthProvider>
        <ConsumidorTeste />
      </AuthProvider>,
    )

    expect(screen.getByText('Carregando...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Gestor Teste')).toBeInTheDocument()
    })

    expect(tokenStorage.get()).toBe('novo-token-ram')
    expect(localStorage.length).toBe(0)
  })

  it('mantém deslogado e limpa RAM se authApi.refresh falhar no cold start', async () => {
    tokenStorage.set('lixo-previo')
    vi.mocked(authApi.refresh).mockRejectedValueOnce(new Error('401'))

    render(
      <AuthProvider>
        <ConsumidorTeste />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Deslogado')).toBeInTheDocument()
    })

    expect(tokenStorage.get()).toBeNull()
  })

  it('limpa a RAM, chama authApi.logout e notifica outras abas ao deslogar', async () => {
    const postMessageSpy = vi.fn()
    const closeSpy = vi.fn()

    class MockBroadcastChannel {
      postMessage = postMessageSpy
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
      close = closeSpy
    }

    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

    vi.mocked(authApi.refresh).mockResolvedValueOnce({
      token: 'token-ativo',
      tipo: 'Bearer',
      expiraEm: '2h',
      usuario: mockUsuario,
    })

    render(
      <AuthProvider>
        <ConsumidorTeste />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Gestor Teste')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(screen.getByText('Deslogado')).toBeInTheDocument()
    expect(tokenStorage.get()).toBeNull()
    expect(authApi.logout).toHaveBeenCalledTimes(1)
    expect(postMessageSpy).toHaveBeenCalledWith({ tipo: 'LOGOUT' })

    vi.unstubAllGlobals()
  })

  it('encerra a sessão local ao receber mensagem LOGOUT de outra aba', async () => {
    let listenerRegistrado: ((evento: MessageEvent<{ tipo?: string }>) => void) | null = null

    class MockBroadcastChannel {
      postMessage = vi.fn()
      addEventListener = (_tipo: string, cb: (evento: MessageEvent<{ tipo?: string }>) => void) => {
        listenerRegistrado = cb
      }
      removeEventListener = vi.fn()
      close = vi.fn()
    }

    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

    vi.mocked(authApi.refresh).mockResolvedValueOnce({
      token: 'token-ativo',
      tipo: 'Bearer',
      expiraEm: '2h',
      usuario: mockUsuario,
    })

    render(
      <AuthProvider>
        <ConsumidorTeste />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Gestor Teste')).toBeInTheDocument()
    })

    act(() => {
      listenerRegistrado?.({ data: { tipo: 'LOGOUT' } } as MessageEvent<{ tipo?: string }>)
    })

    expect(screen.getByText('Deslogado')).toBeInTheDocument()
    expect(tokenStorage.get()).toBeNull()

    vi.unstubAllGlobals()
  })
})
