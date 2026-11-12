import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Alert, Badge, Button, ConfirmDialog, Drawer, IdBadge } from '../../components/ui';
import { solicitacoesSvoApi } from '../../services/api/solicitacoesSvoApi';
import { ApiError, mensagemDeErro } from '../../services/api/http';
import type { SolicitacaoSvoDetalhada } from '../../types/solicitacaoSvo';
import { LABELS_STATUS_ORDEM_SVO, LABELS_STATUS_SOLICITACAO_SVO } from '../../types/solicitacaoSvo';
import { formatarDataHora, toneStatusOrdem, toneStatusSolicitacao } from './formatacao';

interface DrawerTriagemSvoProps {
  /** Solicitação a analisar; `null` fecha o painel. */
  solicitacaoId: number | null;
  onClose: () => void;
  /** Avisado depois que a API confirma, para a lista ser atualizada. */
  onConfirmada: () => void;
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

/** Análise e confirmação de uma solicitação SVO (BL27 / RF20, RF21). */
export function DrawerTriagemSvo({ solicitacaoId, onClose, onConfirmada }: DrawerTriagemSvoProps) {
  const [detalhe, setDetalhe] = useState<SolicitacaoSvoDetalhada | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);
  const [confirmadaAgora, setConfirmadaAgora] = useState(false);

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
      onConfirmada();
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

  const podeConfirmar = detalhe?.status === 'EM_TRIAGEM' && !carregando;

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
          podeConfirmar ? (
            <div className="flex justify-end">
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
            </section>
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
