import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';
import { Alert, Badge, Button, ConfirmDialog, Drawer, IdBadge, Textarea } from '../../components/ui';
import { recursoAtivo } from '../../config/recursosBackend';
import { solicitacoesSvoApi } from '../../services/api/solicitacoesSvoApi';
import { ApiError, mensagemDeErro } from '../../services/api/http';
import type { SolicitacaoSvoDetalhada } from '../../types/solicitacaoSvo';
import { LABELS_STATUS_ORDEM_SVO, LABELS_STATUS_SOLICITACAO_SVO } from '../../types/solicitacaoSvo';
import { erroDaJustificativa, MAX_JUSTIFICATIVA_RECUSA_SVO } from '../../utils/justificativaRecusa';
import { usePermissao } from '../../utils/permissoes';
import { formatarDataHora, toneStatusOrdem, toneStatusSolicitacao } from './formatacao';

interface DrawerTriagemSvoProps {
  /** Solicitação a analisar; `null` fecha o painel. */
  solicitacaoId: number | null;
  onClose: () => void;
  /** Avisado depois que a API confirma ou recusa, para a lista ser atualizada. */
  onAtualizada: () => void;
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{rotulo}</dt>
      <dd className="mt-1 text-sm break-words whitespace-pre-line text-slate-800">{children}</dd>
    </div>
  );
}

const usuario = (id?: number | null) => (id ? `Usuário #${id}` : 'Não informado');

/** Análise, confirmação e recusa justificada de uma solicitação SVO (BL27 / RF20, RF21). */
export function DrawerTriagemSvo({ solicitacaoId, onClose, onAtualizada }: DrawerTriagemSvoProps) {
  const { pode } = usePermissao();
  const podeAnalisar = pode('triagemSvo.analisar');
  // Recusa SVO depende do endpoint da SCRUM-178
  const podeRecusar = podeAnalisar && recursoAtivo('recusaSvo');
  const podeAgendarColeta = pode('viagens.alocarSvo');
  const [detalhe, setDetalhe] = useState<SolicitacaoSvoDetalhada | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);
  const [confirmadaAgora, setConfirmadaAgora] = useState(false);
  const [modoRecusa, setModoRecusa] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [erroRecusa, setErroRecusa] = useState<string | null>(null);
  const [recusadaAgora, setRecusadaAgora] = useState(false);

  // Só a resposta da solicitação aberta por último é aplicada
  const ultimaConsulta = useRef(0);
  const ultimaConfirmacao = useRef(0);

  const carregar = useCallback(async (id: number) => {
    const consulta = ++ultimaConsulta.current;
    setCarregando(true);
    setErroCarga(null);
    try {
      const resposta = await solicitacoesSvoApi.buscarPorId(id);
      if (consulta === ultimaConsulta.current) setDetalhe(resposta);
    } catch (error) {
      if (consulta !== ultimaConsulta.current) return;
      setDetalhe(null);
      setErroCarga(mensagemDeErro(error));
    } finally {
      if (consulta === ultimaConsulta.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    ++ultimaConsulta.current;
    ++ultimaConfirmacao.current;
    setDetalhe(null);
    setErroCarga(null);
    setErroConfirmacao(null);
    setConfirmadaAgora(false);
    setDialogoAberto(false);
    setModoRecusa(false);
    setMotivo('');
    setErroMotivo(null);
    setErroRecusa(null);
    setRecusadaAgora(false);
    setEnviando(false);
    if (solicitacaoId !== null) void carregar(solicitacaoId);
  }, [solicitacaoId, carregar]);

  async function confirmar() {
    if (!detalhe || enviando) return;

    const id = detalhe.id;
    const confirmacao = ++ultimaConfirmacao.current;
    setEnviando(true);
    setErroConfirmacao(null);

    try {
      const { solicitacao, ordem } = await solicitacoesSvoApi.confirmar(id);
      if (confirmacao !== ultimaConfirmacao.current) return;

      // A ordem exibida é sempre a devolvida pela API
      setDetalhe({ ...solicitacao, ordem });
      setConfirmadaAgora(true);
      onAtualizada();
    } catch (error) {
      if (confirmacao !== ultimaConfirmacao.current) return;

      setErroConfirmacao(mensagemDeErro(error));
      if (error instanceof ApiError && error.status === 409) {
        void carregar(id);
      }
    } finally {
      if (confirmacao === ultimaConfirmacao.current) {
        setEnviando(false);
        setDialogoAberto(false);
      }
    }
  }

  async function recusar() {
    if (!detalhe || enviando) return;
    const erroJustificativa = erroDaJustificativa(motivo, MAX_JUSTIFICATIVA_RECUSA_SVO);
    if (erroJustificativa) {
      setErroMotivo(erroJustificativa);
      return;
    }

    const id = detalhe.id;
    const acao = ++ultimaConfirmacao.current;
    setEnviando(true);
    setErroMotivo(null);
    setErroRecusa(null);

    try {
      await solicitacoesSvoApi.recusar(id, motivo.trim());
      if (acao !== ultimaConfirmacao.current) return;
      // Status e motivo exibidos são os gravados pelo servidor
      setModoRecusa(false);
      setMotivo('');
      setRecusadaAgora(true);
      onAtualizada();
      void carregar(id);
    } catch (error) {
      if (acao !== ultimaConfirmacao.current) return;
      setErroRecusa(mensagemDeErro(error));
      if (error instanceof ApiError && error.status === 409) void carregar(id);
    } finally {
      if (acao === ultimaConfirmacao.current) setEnviando(false);
    }
  }

  const podeConfirmar = detalhe?.status === 'EM_TRIAGEM' && !carregando && podeAnalisar;
  const aguardandoAlocacao = detalhe?.ordem?.status === 'AGUARDANDO_ALOCACAO';

  return (
    <>
      <Drawer
        isOpen={solicitacaoId !== null}
        onClose={enviando ? () => {} : onClose}
        title={
          <span className="flex items-center gap-2">
            Solicitação SVO {solicitacaoId !== null && <IdBadge id={`#${solicitacaoId}`} />}
          </span>
        }
        subtitle="Analise os dados da ocorrência antes de confirmar o atendimento."
        footer={
          podeConfirmar && !modoRecusa ? (
            <div className="flex flex-wrap justify-end gap-2">
              {podeRecusar && (
                <Button
                  variant="danger-outline"
                  onClick={() => {
                    setModoRecusa(true);
                    setErroRecusa(null);
                  }}
                  disabled={enviando}
                >
                  Recusar
                </Button>
              )}
              <Button onClick={() => setDialogoAberto(true)} disabled={enviando}>
                {enviando ? 'Confirmando...' : 'Confirmar e gerar ordem'}
              </Button>
            </div>
          ) : undefined
        }
      >
        {carregando && !detalhe && (
          <p className="text-sm text-slate-500" aria-busy="true">
            Carregando solicitação...
          </p>
        )}

        {erroCarga && (
          <Alert tone="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{erroCarga}</span>
              {solicitacaoId !== null && (
                <Button variant="outline" size="sm" onClick={() => void carregar(solicitacaoId)}>
                  Tentar novamente
                </Button>
              )}
            </div>
          </Alert>
        )}

        {detalhe && (
          <div className="grid gap-6">
            {confirmadaAgora && detalhe.ordem && (
              <Alert tone="success" title="Solicitação confirmada">
                Ordem de coleta #{detalhe.ordem.id} gerada pelo servidor, aguardando a alocação de
                veículo e equipe.
              </Alert>
            )}

            {recusadaAgora && detalhe.status === 'RECUSADA' && (
              <Alert tone="success" title="Solicitação recusada">
                A recusa e a justificativa foram registradas pelo servidor. Nenhuma ordem de coleta
                foi gerada.
              </Alert>
            )}

            {erroRecusa && (
              <Alert tone="danger" title="Não foi possível recusar">
                {erroRecusa}
              </Alert>
            )}

            {erroConfirmacao && (
              <Alert tone="danger" title="Não foi possível confirmar">
                {erroConfirmacao}
              </Alert>
            )}

            <dl className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Status">
                <Badge tone={toneStatusSolicitacao(detalhe.status)}>
                  {LABELS_STATUS_SOLICITACAO_SVO[detalhe.status] ?? detalhe.status}
                </Badge>
              </Campo>
              <Campo rotulo="Registrada em">{formatarDataHora(detalhe.criado_em)}</Campo>
              <div className="sm:col-span-2">
                <Campo rotulo="Solicitante">{detalhe.dados_solicitante}</Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo rotulo="Local da ocorrência">{detalhe.local_ocorrencia}</Campo>
              </div>
              {detalhe.observacoes && (
                <div className="sm:col-span-2">
                  <Campo rotulo="Observações">{detalhe.observacoes}</Campo>
                </div>
              )}
              <Campo rotulo="Material sensível">
                {detalhe.material_sensivel ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                    <AlertTriangle size={14} /> Sim, exige protocolo específico
                  </span>
                ) : (
                  'Não'
                )}
              </Campo>
              <Campo rotulo="Registrada por">{usuario(detalhe.registrante_id)}</Campo>
              {detalhe.status === 'RECUSADA' && detalhe.motivo_recusa && (
                <div className="sm:col-span-2">
                  <Campo rotulo="Justificativa da recusa">{detalhe.motivo_recusa}</Campo>
                </div>
              )}
              {detalhe.confirmado_em && (
                <>
                  <Campo rotulo="Confirmada em">{formatarDataHora(detalhe.confirmado_em)}</Campo>
                  <Campo rotulo="Confirmada por">{usuario(detalhe.confirmado_por)}</Campo>
                </>
              )}
            </dl>

            <section
              aria-labelledby="ordem-coleta"
              className="rounded-lg border border-divider p-4"
            >
              <h3 id="ordem-coleta" className="text-sm font-bold text-slate-900">
                Ordem de coleta
              </h3>
              {detalhe.ordem ? (
                <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Campo rotulo="Número">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" /> Ordem #
                      {detalhe.ordem.id}
                    </span>
                  </Campo>
                  <Campo rotulo="Status">
                    <Badge tone={toneStatusOrdem(detalhe.ordem.status)}>
                      {LABELS_STATUS_ORDEM_SVO[detalhe.ordem.status] ?? detalhe.ordem.status}
                    </Badge>
                  </Campo>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  {detalhe.status === 'EM_TRIAGEM'
                    ? 'A ordem é gerada pelo servidor quando a solicitação é confirmada.'
                    : 'Nenhuma ordem de coleta ativa para esta solicitação.'}
                </p>
              )}
              {aguardandoAlocacao && podeAgendarColeta && (
                <Link
                  to="/viagens?aba=svo"
                  state={{ agendarSolicitacaoSvoId: detalhe.id }}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover"
                >
                  <CalendarClock size={14} /> Agendar coleta em Viagens &gt; SVO
                </Link>
              )}
            </section>

            {modoRecusa && (
              <section
                aria-labelledby="recusa-svo"
                className="rounded-lg border border-divider bg-slate-50 p-4"
              >
                <h3 id="recusa-svo" className="mb-3 text-sm font-bold text-slate-900">
                  Recusar solicitação
                </h3>
                <Textarea
                  id="motivo-recusa-svo"
                  label={`Justificativa da recusa * (máx. ${MAX_JUSTIFICATIVA_RECUSA_SVO} caracteres):`}
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    if (erroMotivo) setErroMotivo(null);
                  }}
                  required
                  aria-invalid={Boolean(erroMotivo)}
                  aria-describedby={erroMotivo ? 'motivo-recusa-svo-erro' : undefined}
                  maxLength={MAX_JUSTIFICATIVA_RECUSA_SVO}
                  rows={3}
                  className="bg-white text-[13px]"
                  disabled={enviando}
                />
                {erroMotivo && (
                  <p
                    id="motivo-recusa-svo-erro"
                    role="alert"
                    className="-mt-2 text-xs font-semibold text-rose-700"
                  >
                    {erroMotivo}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    {motivo.length}/{MAX_JUSTIFICATIVA_RECUSA_SVO} caracteres
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setModoRecusa(false);
                        setErroMotivo(null);
                      }}
                      disabled={enviando}
                    >
                      Voltar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void recusar()}
                      disabled={enviando}
                    >
                      {enviando ? 'Recusando...' : 'Confirmar recusa'}
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        isOpen={dialogoAberto}
        onClose={() => !enviando && setDialogoAberto(false)}
        onConfirm={confirmar}
        variant="primary"
        title="Confirmar solicitação SVO"
        description={
          <>
            Confirmar o atendimento da solicitação <strong>#{detalhe?.id}</strong>? A ordem de
            coleta será gerada e ficará aguardando a alocação de veículo e equipe.
          </>
        }
        confirmLabel="Confirmar"
        isLoading={enviando}
      />
    </>
  );
}
