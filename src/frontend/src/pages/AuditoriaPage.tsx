import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, Button, Card, Pagination, Table } from '../components/ui';
import { auditoriaApi } from '../services/api/auditoriaApi';
import { ApiError, mensagemDeErro } from '../services/api/http';
import type { RegistroAuditoria } from '../types/auditoria';
import { LABELS_MODULO_AUDITORIA } from '../types/auditoria';
import { cn } from '../utils/cn';

const ITENS_POR_PAGINA = 20;

const formatarDataHora = (valor: string) => {
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
};

function mensagemDeFalha(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Você não tem permissão para consultar os registros de auditoria.';
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'A consulta de auditoria ainda não está disponível no servidor.';
  }
  return mensagemDeErro(error);
}

/** Consulta dos registros de auditoria (BL04 / RF27), restrita ao Administrador. */
export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<{ mensagem: string; podeTentarDeNovo: boolean } | null>(null);

  // Só a resposta da última consulta é aplicada (troca rápida de página)
  const ultimaConsulta = useRef(0);

  /** Busca uma página no servidor; o histórico completo nunca é carregado de uma vez. */
  const carregar = useCallback(async (paginaDesejada: number) => {
    const consulta = ++ultimaConsulta.current;
    setCarregando(true);
    try {
      const resposta = await auditoriaApi.listar(paginaDesejada, ITENS_POR_PAGINA);
      if (consulta !== ultimaConsulta.current) return;
      setRegistros(resposta.dados);
      setTotal(resposta.paginacao.total);
      setPagina(resposta.paginacao.pagina);
      setErro(null);
    } catch (error) {
      if (consulta !== ultimaConsulta.current) return;
      // Em caso de falha, nenhum dado anterior continua visível
      setRegistros([]);
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
    void carregar(1);
  }, [carregar]);

  const atualizando = carregando && registros.length > 0;

  const mensagemVazia = carregando
    ? 'Carregando registros de auditoria...'
    : erro
      ? 'Não foi possível exibir os registros.'
      : 'Nenhum registro de auditoria encontrado.';

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
                onClick={() => void carregar(pagina)}
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
            <h2 className="text-[15px] font-bold text-text md:text-base">Registros de Auditoria</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Ações registradas no sistema, das mais recentes para as mais antigas.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregar(1)}
            disabled={carregando}
          >
            <RefreshCw size={13} className={cn('mr-1.5', carregando && 'animate-spin')} />
            {carregando ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>

        <div
          aria-busy={carregando}
          className={cn('transition-opacity', atualizando && 'opacity-50')}
        >
          <Table>
            <thead>
              <tr>
                <th>Data e hora</th>
                <th>Usuário</th>
                <th>Módulo</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-9 text-center text-slate-500">
                    {mensagemVazia}
                  </td>
                </tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatarDataHora(r.data_hora)}</td>
                    <td className="whitespace-nowrap">
                      {r.usuario_id === null ? 'Não identificado' : `Usuário #${r.usuario_id}`}
                    </td>
                    <td className="whitespace-nowrap" title={r.modulo}>
                      {LABELS_MODULO_AUDITORIA[r.modulo] ?? r.modulo}
                    </td>
                    <td className="font-mono text-xs break-all text-slate-700">{r.acao}</td>
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
            onPageChange={(nova) => void carregar(nova)}
          />
        )}
      </Card>
    </div>
  );
}
