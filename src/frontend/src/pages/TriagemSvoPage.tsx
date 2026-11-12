import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  FilterSelect,
  IdBadge,
  Pagination,
  Table,
} from '../components/ui';
import { solicitacoesSvoApi } from '../services/api/solicitacoesSvoApi';
import { ApiError, mensagemDeErro } from '../services/api/http';
import type { SolicitacaoSvo, StatusSolicitacaoSvo } from '../types/solicitacaoSvo';
import { LABELS_STATUS_SOLICITACAO_SVO } from '../types/solicitacaoSvo';
import { cn } from '../utils/cn';
import { DrawerTriagemSvo } from './triagemSvo/DrawerTriagemSvo';
import { formatarDataHora, toneStatusSolicitacao } from './triagemSvo/formatacao';

const ITENS_POR_PAGINA = 20;

type FiltroStatus = StatusSolicitacaoSvo | 'TODAS';

const OPCOES_STATUS = [
  ...(Object.keys(LABELS_STATUS_SOLICITACAO_SVO) as StatusSolicitacaoSvo[]).map((status) => ({
    value: status,
    label: LABELS_STATUS_SOLICITACAO_SVO[status],
  })),
  { value: 'TODAS', label: 'Todos os status' },
];

function mensagemDeFalha(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Você não tem permissão para consultar as solicitações SVO.';
  }
  return mensagemDeErro(error);
}

/** Triagem das solicitações SVO e confirmação do atendimento (BL27). */
export default function TriagemSvoPage() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoSvo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [status, setStatus] = useState<FiltroStatus>('EM_TRIAGEM');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<{ mensagem: string; podeTentarDeNovo: boolean } | null>(null);
  const [selecionada, setSelecionada] = useState<number | null>(null);

  // Só a resposta da última consulta é aplicada (troca rápida de página ou filtro)
  const ultimaConsulta = useRef(0);

  const carregar = useCallback(async (paginaDesejada: number, filtro: FiltroStatus) => {
    const consulta = ++ultimaConsulta.current;
    setCarregando(true);
    try {
      const resposta = await solicitacoesSvoApi.listar({
        pagina: paginaDesejada,
        limite: ITENS_POR_PAGINA,
        status: filtro === 'TODAS' ? undefined : filtro,
      });
      if (consulta !== ultimaConsulta.current) return;
      setSolicitacoes(resposta.dados);
      setTotal(resposta.paginacao.total);
      setPagina(resposta.paginacao.pagina);
      setErro(null);
    } catch (error) {
      if (consulta !== ultimaConsulta.current) return;
      // Em caso de falha, nenhum dado anterior continua visível
      setSolicitacoes([]);
      setTotal(0);
      setErro({
        mensagem: mensagemDeFalha(error),
        podeTentarDeNovo: !(error instanceof ApiError && error.status === 403),
      });
    } finally {
      if (consulta === ultimaConsulta.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(1, status);
  }, [carregar, status]);

  const atualizando = carregando && solicitacoes.length > 0;

  const mensagemVazia = carregando
    ? 'Carregando solicitações...'
    : erro
      ? 'Não foi possível exibir as solicitações.'
      : status === 'EM_TRIAGEM'
        ? 'Nenhuma solicitação aguardando triagem.'
        : 'Nenhuma solicitação encontrada.';

  return (
    <div className="grid gap-6">
      {erro && (
        <Alert tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{erro.mensagem}</span>
            {erro.podeTentarDeNovo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void carregar(pagina, status)}
                disabled={carregando}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        </Alert>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-divider px-3.5 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h2 className="text-[15px] font-bold text-text md:text-base">Solicitações SVO</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Analise os chamados recebidos e confirme o atendimento para gerar a ordem de coleta.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <FilterSelect
              aria-label="Filtrar por status"
              value={status}
              onChange={(valor) => setStatus(valor as FiltroStatus)}
              options={OPCOES_STATUS}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void carregar(1, status)}
              disabled={carregando}
            >
              <RefreshCw size={13} className={cn('mr-1.5', carregando && 'animate-spin')} />
              {carregando ? 'Atualizando...' : 'Atualizar'}
            </Button>
          </div>
        </div>

        <div
          aria-busy={carregando}
          className={cn('transition-opacity', atualizando && 'opacity-50')}
        >
          <Table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Registrada em</th>
                <th>Local da ocorrência</th>
                <th>Status</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {solicitacoes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-9 text-center text-slate-500">
                    {mensagemVazia}
                  </td>
                </tr>
              ) : (
                solicitacoes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <IdBadge id={`#${s.id}`} />
                    </td>
                    <td className="whitespace-nowrap">{formatarDataHora(s.criado_em)}</td>
                    <td>
                      <span
                        className="block max-w-[16rem] truncate md:max-w-xs"
                        title={s.local_ocorrencia}
                      >
                        {s.local_ocorrencia}
                      </span>
                      {s.material_sensivel && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertTriangle size={12} /> Material sensível
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tone={toneStatusSolicitacao(s.status)}>
                        {LABELS_STATUS_SOLICITACAO_SVO[s.status] ?? s.status}
                      </Badge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelecionada(s.id)}
                        aria-label={`Analisar solicitação ${s.id}`}
                      >
                        {s.status === 'EM_TRIAGEM' ? 'Analisar' : 'Detalhes'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        {/* Sem rodapé na falha: "Nenhum registro encontrado" seria enganoso */}
        {!erro && (
          <Pagination
            currentPage={pagina}
            totalItems={total}
            pageSize={ITENS_POR_PAGINA}
            onPageChange={(nova) => void carregar(nova, status)}
          />
        )}
      </Card>

      <DrawerTriagemSvo
        solicitacaoId={selecionada}
        onClose={() => setSelecionada(null)}
        onConfirmada={() => void carregar(pagina, status)}
      />
    </div>
  );
}
