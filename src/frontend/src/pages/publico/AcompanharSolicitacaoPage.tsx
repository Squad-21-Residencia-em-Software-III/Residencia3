import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Alert, Badge, Button, Card, Field, Input } from '../../components/ui'
import type { BadgeTone } from '../../components/ui'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { ApiError, CODIGO_CANCELADO } from '../../services/api/http'
import { solicitacaoExternaApi } from '../../services/api/solicitacaoExternaApi'
import type { ConsultaPublica, EstadoPublico } from '../../services/api/solicitacaoExternaApi'

/**
 * Acompanhamento público por protocolo + segredo (credencial do backend) (SCRUM-250 / SCRUM-267), sem login.
 *
 * Regras desta tela:
 * - o segredo só existe na memória desta tela: nada de URL, localStorage, sessionStorage ou cache;
 * - só mostra os campos públicos da consulta (nunca motorista, equipe, veículo, GPS ou detalhes internos);
 * - erro de credencial é sempre genérico (não revela se o protocolo existe);
 * - resposta de uma consulta antiga nunca aparece depois que o protocolo ou o segredo mudaram.
 */

/** Textos e cores dos sete estados públicos definidos pelo backend (SCRUM-266). */
const APRESENTACAO: Record<EstadoPublico, { rotulo: string; tom: BadgeTone; explicacao: string }> = {
  RECEBIDA: { rotulo: 'Recebida', tom: 'info', explicacao: 'Recebemos o seu chamado e ele aguarda análise.' },
  EM_ANALISE: { rotulo: 'Em análise', tom: 'warning', explicacao: 'A equipe está analisando as informações enviadas.' },
  CONFIRMADA: { rotulo: 'Confirmada', tom: 'success', explicacao: 'O chamado foi confirmado e será encaminhado para atendimento.' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', tom: 'info', explicacao: 'O atendimento está em andamento.' },
  CONCLUIDA: { rotulo: 'Concluída', tom: 'success', explicacao: 'O atendimento foi concluído.' },
  NAO_ACOLHIDA: { rotulo: 'Não acolhida', tom: 'danger', explicacao: 'O chamado não pôde ser acolhido.' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'neutral', explicacao: 'O chamado foi cancelado.' },
}

// Mensagem única: o backend não diz se o protocolo não existe, se a credencial está errada, expirou ou foi revogada.
const MENSAGEM_CREDENCIAL =
  'Não foi possível consultar com os dados informados. Confira o protocolo e o segredo e tente novamente. Se o prazo de consulta tiver terminado, procure a FSPH informando o número do protocolo.'
const ESPERA_PADRAO_SEGUNDOS = 30
const PRAZO_CONSULTA_MS = 20_000

interface Falha {
  tipo: 'preenchimento' | 'credencial' | 'limite' | 'indisponivel'
  mensagem: string
  esperaSegundos?: number
}

function classificarFalha(erro: unknown): Falha {
  if (erro instanceof ApiError) {
    if (erro.status === 429) {
      return {
        tipo: 'limite',
        mensagem: 'Muitas tentativas. Aguarde um pouco antes de consultar de novo.',
        esperaSegundos: erro.retryAfterSegundos ?? ESPERA_PADRAO_SEGUNDOS,
      }
    }
    if (erro.status === 404 && erro.codigo === 'RECURSO_DESATIVADO') {
      return { tipo: 'indisponivel', mensagem: 'O acompanhamento público está desativado no momento.' }
    }
    if ([400, 401, 403, 404, 410].includes(erro.status)) return { tipo: 'credencial', mensagem: MENSAGEM_CREDENCIAL }
    if (erro.status === 0) {
      return { tipo: 'indisponivel', mensagem: 'Não foi possível conectar. Verifique sua conexão e tente novamente.' }
    }
  }
  return { tipo: 'indisponivel', mensagem: 'O serviço está indisponível no momento. Tente novamente em instantes.' }
}

function formatarDataHora(iso: string | null): string | null {
  if (!iso) return null
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default function AcompanharSolicitacaoPage() {
  const idTitulo = useId()
  const idProtocolo = useId()
  const idSegredo = useId()
  const idFalha = useId()
  const online = useOnlineStatus()

  const [protocolo, setProtocolo] = useState('')
  const [segredo, setSegredo] = useState('')
  const [mostrarSegredo, setMostrarSegredo] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [resultado, setResultado] = useState<ConsultaPublica | null>(null)
  const [falha, setFalha] = useState<Falha | null>(null)
  const [esperaSegundos, setEsperaSegundos] = useState(0)
  const faltaProtocolo = falha?.tipo === 'preenchimento' && !protocolo.trim()
  const faltaSegredo = falha?.tipo === 'preenchimento' && !segredo

  useEffect(() => {
    if (falha?.tipo === 'preenchimento') {
      document.getElementById(faltaProtocolo ? idProtocolo : idSegredo)?.focus()
    }
  }, [falha, faltaProtocolo, idProtocolo, idSegredo])

  /** Número da consulta "valida" no momento; respostas de números antigos são ignoradas. */
  const numeroAtualRef = useRef(0)
  const controleRef = useRef<AbortController | null>(null)
  const prazoRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      // Ao sair da tela: cancela a consulta e descarta qualquer resposta pendente.
      numeroAtualRef.current += 1
      clearTimeout(prazoRef.current)
      controleRef.current?.abort()
      controleRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (esperaSegundos <= 0) return
    const temporizador = setTimeout(() => setEsperaSegundos((s) => s - 1), 1000)
    return () => clearTimeout(temporizador)
  }, [esperaSegundos])

  /** Descarta consulta em andamento e o que está na tela (dados de outra credencial não podem ficar). */
  function invalidarConsulta() {
    numeroAtualRef.current += 1
    clearTimeout(prazoRef.current)
    controleRef.current?.abort()
    controleRef.current = null
    setConsultando(false)
    setResultado(null)
    setFalha(null)
  }

  function aoAlterarProtocolo(valor: string) {
    invalidarConsulta()
    setProtocolo(valor)
  }

  function aoAlterarSegredo(valor: string) {
    invalidarConsulta()
    setSegredo(valor)
  }

  function novaConsulta() {
    invalidarConsulta()
    setProtocolo('')
    setSegredo('')
    setMostrarSegredo(false)
    setEsperaSegundos(0)
  }

  async function consultar() {
    if (controleRef.current || esperaSegundos > 0 || !online) return // protege duplo clique
    const protocoloLimpo = protocolo.trim()
    if (!protocoloLimpo || !segredo) {
      setResultado(null)
      setFalha({ tipo: 'preenchimento', mensagem: 'Informe o protocolo e o segredo para consultar.' })
      return
    }

    const numero = ++numeroAtualRef.current
    const controle = new AbortController()
    controleRef.current = controle
    setConsultando(true)
    prazoRef.current = setTimeout(() => {
      if (numeroAtualRef.current !== numero) return
      invalidarConsulta()
      setFalha({ tipo: 'indisponivel', mensagem: 'A consulta demorou demais. Tente novamente.' })
    }, PRAZO_CONSULTA_MS)
    setFalha(null)
    setResultado(null)

    try {
      const consulta = await solicitacaoExternaApi.consultar(protocoloLimpo, segredo, controle.signal)
      if (numeroAtualRef.current !== numero) return
      setResultado(consulta)
    } catch (erro) {
      if (numeroAtualRef.current !== numero) return
      if (erro instanceof ApiError && erro.codigo === CODIGO_CANCELADO) return
      const classificada = classificarFalha(erro)
      setFalha(classificada)
      if (classificada.tipo === 'limite') setEsperaSegundos(classificada.esperaSegundos ?? ESPERA_PADRAO_SEGUNDOS)
    } finally {
      if (numeroAtualRef.current === numero) {
        clearTimeout(prazoRef.current)
        controleRef.current = null
        setConsultando(false)
      }
    }
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    void consultar()
  }

  const apresentacao = resultado ? APRESENTACAO[resultado.estado] : null
  const atualizadoEm = formatarDataHora(resultado?.atualizadoEm ?? null)
  const expiraEm = formatarDataHora(resultado?.expiraEm ?? null)
  const botaoDesativado = consultando || esperaSegundos > 0 || !online

  return (
    <>
      <title>Acompanhar solicitação • FSPH</title>
      <meta name="robots" content="noindex, nofollow" />
      <section className="flex flex-col gap-5" aria-labelledby={idTitulo}>
        <div>
          <h1 id={idTitulo} className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
            Acompanhar solicitação
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Informe o protocolo e o segredo que você recebeu ao registrar o chamado. Não é preciso fazer login. Por
            segurança, não mostramos dados pessoais nem detalhes internos do atendimento.
          </p>
        </div>

        <Card className="p-5">
          <form onSubmit={aoEnviar} noValidate autoComplete="off">
            <Field label="Protocolo" htmlFor={idProtocolo}>
              <Input
                id={idProtocolo}
                required
                aria-invalid={faltaProtocolo || undefined}
                aria-describedby={faltaProtocolo ? idFalha : undefined}
                value={protocolo}
                onChange={(e) => aoAlterarProtocolo(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={64}
              />
            </Field>

            <Field label="Segredo" htmlFor={idSegredo}>
              <div className="relative">
                <Input
                  id={idSegredo}
                  required
                  aria-invalid={faltaSegredo || undefined}
                  aria-describedby={faltaSegredo ? idFalha : undefined}
                  type={mostrarSegredo ? 'text' : 'password'}
                  value={segredo}
                  onChange={(e) => aoAlterarSegredo(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={128}
                  className="pr-11"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSegredo((atual) => !atual)}
                  aria-label={mostrarSegredo ? 'Ocultar segredo' : 'Mostrar segredo'}
                  aria-pressed={mostrarSegredo}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-700"
                >
                  {mostrarSegredo ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </Field>

            {!online && (
              <Alert tone="warning" className="mb-4">
                Você está sem conexão. A consulta volta a funcionar quando a internet retornar.
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={botaoDesativado}>
              {consultando ? 'Consultando…' : esperaSegundos > 0 ? `Aguarde ${esperaSegundos}s` : 'Consultar'}
            </Button>
          </form>
        </Card>

        <p role="status" className="sr-only">{consultando ? 'Consultando solicitação…' : ''}</p>
        {falha && (
          <Alert tone={falha.tipo === 'credencial' || falha.tipo === 'indisponivel' ? 'danger' : 'warning'}>
            <span id={idFalha}>{falha.mensagem}</span>
            {falha.tipo === 'indisponivel' && (
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => void consultar()} disabled={botaoDesativado}>
                  Tentar novamente
                </Button>
              </div>
            )}
          </Alert>
        )}

        <div aria-live="polite" aria-atomic="true">
          {resultado && apresentacao && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Protocolo</p>
                  <p className="font-display text-lg font-bold break-all text-slate-900">{resultado.protocolo}</p>
                </div>
                <Badge tone={apresentacao.tom}>{apresentacao.rotulo}</Badge>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-700">{apresentacao.explicacao}</p>
              {resultado.mensagemPublica && (
                <p className="mt-2 text-sm leading-relaxed font-medium break-words text-slate-800">{resultado.mensagemPublica}</p>
              )}
              {atualizadoEm && <p className="mt-4 text-xs text-slate-500">Atualizado em {atualizadoEm}</p>}
              {expiraEm && <p className="mt-1 text-xs text-slate-500">Consulta disponível até {expiraEm}</p>}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => void consultar()} disabled={botaoDesativado}>
                  Atualizar
                </Button>
                <Button variant="ghost" onClick={novaConsulta}>
                  Nova consulta
                </Button>
              </div>
            </Card>
          )}
        </div>
      </section>
    </>
  )
}
