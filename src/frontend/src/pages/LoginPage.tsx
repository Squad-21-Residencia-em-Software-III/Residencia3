import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api/http';
import { Alert } from '../components/ui';

interface FloatingInputProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  suffix?: ReactNode;
}

function FloatingInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  autoFocus,
  disabled,
  suffix,
}: FloatingInputProps) {
  return (
    <div className="relative mb-5 w-full text-left">
      <input
        id={id}
        type={type}
        placeholder=" "
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        className="peer w-full appearance-none rounded-[14px] border border-white/15 bg-black/40 pt-6 pr-11 pb-2.5 pl-4 font-sans text-[15px] text-white transition-all duration-250 outline-none hover:border-[#314569]/45 focus:border-primary focus:bg-black/55 focus:shadow-[0_0_0_1px_#1554b8,0_0_16px_rgba(21,84,184,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute top-[18px] left-4 font-sans text-[15px] font-normal tracking-normal text-[#9ca3af] transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] peer-focus:top-2 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:tracking-[0.4px] peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:tracking-[0.4px] peer-[:not(:placeholder-shown)]:text-primary"
      >
        {label}
      </label>
      {suffix && <div className="absolute inset-y-0 right-0 flex items-center pr-4">{suffix}</div>}
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destino = (location.state as { de?: string } | null)?.de ?? '/inicio';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ajudaAberta, setAjudaAberta] = useState(false);

  const mousePos = useRef({ x: 50, y: 50 });
  const currentPos = useRef({ x: 50, y: 50 });
  const bgRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      mousePos.current = {
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      };
    }

    function animateGlow() {
      currentPos.current.x += (mousePos.current.x - currentPos.current.x) * 0.065;
      currentPos.current.y += (mousePos.current.y - currentPos.current.y) * 0.065;
      if (bgRef.current) {
        bgRef.current.style.setProperty('--mx', `${currentPos.current.x}%`);
        bgRef.current.style.setProperty('--my', `${currentPos.current.y}%`);
      }
      rafRef.current = requestAnimationFrame(animateGlow);
    }

    window.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(animateGlow);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro('');

    if (!email.trim() || !senha) {
      setErro('Informe seu e-mail e sua senha.');
      return;
    }

    setEnviando(true);
    try {
      await login(email.trim().toLowerCase(), senha);
      navigate(destino, { replace: true });
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.mensagemCompleta
          : 'Não foi possível entrar. Tente novamente mais tarde.',
      );
      setEnviando(false);
    }
  }

  return (
    <div
      ref={bgRef}
      className="relative flex min-h-full w-full overflow-hidden bg-[#0b1228] font-sans [--mx:50%] [--my:50%]"
    >
      {/* Brilho interativo que acompanha o cursor */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(600px_circle_at_var(--mx)_var(--my),rgba(21,84,184,0.22)_0%,rgba(21,84,184,0.06)_45%,transparent_70%)]" />

      {/* Luz ambiente estática */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_15%_50%,rgba(21,84,184,0.05)_0%,transparent_50%),radial-gradient(circle_at_85%_30%,rgba(14,23,46,0.08)_0%,transparent_50%)]" />

      {/* Container principal em 2 colunas simétricas */}
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[1400px] flex-col items-center justify-center px-5 py-8 sm:px-10 lg:flex-row">
        {/* Coluna esquerda — Logo institucional na proporção áurea (316px = 268px visíveis vs 420px do card) */}
        <div className="hidden flex-1 animate-login-left flex-col items-center justify-center gap-8 p-8 lg:flex">
          <img
            src="/assets/logo.png"
            alt="FSPH — Fundação de Saúde Parreiras Horta em Movimento"
            className="w-full max-w-[316px] object-contain"
          />
        </div>

        {/* Coluna direita — Card glassmorphism */}
        <div className="flex w-full flex-1 animate-login-right items-center justify-center">
          <div className="w-full max-w-[420px] rounded-[24px] border border-white/[0.07] bg-login-card p-8 text-center shadow-login-card backdrop-blur-[30px] backdrop-saturate-120 sm:p-10">
            {/* Logo compacta (mobile / tablet) */}
            <div className="mb-7 flex justify-center lg:hidden">
              <img
                src="/assets/logo.png"
                alt="FSPH — Fundação de Saúde Parreiras Horta em Movimento"
                className="w-2/3 max-w-[210px] object-contain"
              />
            </div>

            <h1 className="mb-2 animate-login-cascade font-display text-[24px] font-semibold tracking-[-0.5px] text-[#ebeeff] [animation-delay:300ms]">
              Bem-Vindo De Volta
            </h1>
            <h2 className="mb-9 animate-login-cascade font-sans text-[15px] font-medium tracking-[0.3px] text-[#9ca3af] [animation-delay:400ms]">
              Faça login para continuar
            </h2>

            <form onSubmit={handleSubmit} noValidate className="text-left">
              <div role="alert" aria-live="polite" className={erro ? 'mb-5' : undefined}>
                {erro && <Alert tone="danger">{erro}</Alert>}
              </div>

              <div className="animate-login-cascade [animation-delay:500ms]">
                <FloatingInput
                  id="login-email"
                  label="E-mail"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={setEmail}
                  disabled={enviando}
                />
              </div>

              <div className="animate-login-cascade [animation-delay:600ms]">
                <FloatingInput
                  id="login-senha"
                  label="Senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={senha}
                  onChange={setSenha}
                  disabled={enviando}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setMostrarSenha((v) => !v)}
                      aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-pressed={mostrarSenha}
                      className="flex cursor-pointer items-center justify-center border-none bg-transparent text-[#9ca3af] transition-colors duration-200 hover:text-white"
                    >
                      {mostrarSenha ? (
                        <EyeOff size={20} strokeWidth={1.8} />
                      ) : (
                        <Eye size={20} strokeWidth={1.8} />
                      )}
                    </button>
                  }
                />
              </div>

              <div className="animate-login-cascade [animation-delay:750ms]">
                <button
                  type="submit"
                  disabled={enviando}
                  className="relative mt-2.5 mb-6 w-full cursor-pointer rounded-[14px] border-none bg-primary px-5 py-4 font-display text-[15px] font-semibold text-white transition-all duration-250 hover:not-disabled:-translate-y-px hover:not-disabled:bg-[#1040a0] active:not-disabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {enviando ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="h-[18px] w-[18px] animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="rgba(255,255,255,0.3)"
                          strokeWidth="3"
                        />
                        <path
                          d="M12 2a10 10 0 0 1 10 10"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      Entrando…
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </button>
              </div>

              <div className="animate-login-cascade text-center [animation-delay:850ms]">
                <button
                  type="button"
                  onClick={() => setAjudaAberta(true)}
                  className="cursor-pointer border-none bg-transparent font-sans text-[13px] font-medium text-[#9ca3af] transition-colors duration-200 hover:text-white"
                >
                  Problemas para acessar a conta?
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Modal de aviso para suporte de acesso */}
      {ajudaAberta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-ajuda-titulo"
          onClick={() => setAjudaAberta(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-[20px] bg-white p-8 text-left shadow-[0_40px_100px_rgba(0,0,0,0.9)]"
          >
            <h2
              id="login-ajuda-titulo"
              className="mt-1 mb-3 font-display text-[22px] font-semibold tracking-[-0.5px] text-text"
            >
              Aviso
            </h2>
            <p className="mb-7 font-sans text-[15px] leading-relaxed text-neutral">
              Confira as informações de acesso e tente novamente com atenção. O acesso é criado e
              liberado pelo administrador do sistema; caso o erro persista ou você tenha esquecido
              sua senha, procure o administrador para redefini-la.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAjudaAberta(false)}
                className="cursor-pointer rounded-xl border-none bg-primary px-6 py-3 font-display text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:bg-[#1040a0] hover:shadow-[0_4px_12px_rgba(21,84,184,0.25)]"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
