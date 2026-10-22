import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ApiError } from '../services/api/http'
import './login.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destino = (location.state as { de?: string } | null)?.de ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ajudaAberta, setAjudaAberta] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro('')

    if (!email.trim() || !senha) {
      setErro('Informe seu e-mail e sua senha.')
      return
    }

    setEnviando(true)
    try {
      await login(email.trim().toLowerCase(), senha)
      navigate(destino, { replace: true })
    } catch (err) {
      setErro(err instanceof ApiError ? err.mensagemCompleta : 'Não foi possível entrar. Tente novamente mais tarde.')
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <div className="login__brand">
        <img src="/assets/logo.png" alt="FSPH — Fundação de Saúde Parreiras Horta em Movimento" />
      </div>

      <form className="login__card" onSubmit={handleSubmit} noValidate>
        <h1 className="login__title">Bem-Vindo De Volta</h1>
        <p className="login__subtitle">Faça login para continuar</p>

        <div role="alert" aria-live="polite">
          {erro && <p className="login__error">{erro}</p>}
        </div>

        <label className="login__field">
          <span className="sr-only">E-mail</span>
          <input
            type="email"
            placeholder="E-mail"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={enviando}
          />
        </label>

        <label className="login__field login__field--password">
          <span className="sr-only">Senha</span>
          <input
            type={mostrarSenha ? 'text' : 'password'}
            placeholder="Senha"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={enviando}
          />
          <button
            type="button"
            className="login__eye"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={mostrarSenha}
          >
            {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </label>

        <button type="submit" className="login__submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <button type="button" className="login__help" onClick={() => setAjudaAberta((v) => !v)}>
          Problemas para acessar a conta?
        </button>
        {ajudaAberta && (
          <p className="login__help-text">
            O acesso é criado e liberado pelo administrador do sistema. Se você esqueceu a senha ou sua conta está
            inativa, procure o administrador para redefini-la.
          </p>
        )}
      </form>
    </div>
  )
}
