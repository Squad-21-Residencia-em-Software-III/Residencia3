import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, Button, Card, Pagination, Table } from '../components/ui';
import { auditoriaApi } from '../services/api/auditoriaApi';
import { ApiError, mensagemDeErro } from '../services/api/http';
import type { RegistroAuditoria } from '../types/auditoria';
import { LABELS_MODULO_AUDITORIA } from '../types/auditoria';

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
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRegistros(await auditoriaApi.listar());
      setErro(null);
      setPagina(1);
    } catch (error) {
      // Em caso de falha, nenhum dado anterior continua visível
      setRegistros([]);
      setErro(mensagemDeFalha(error));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const inicio = (pagina - 1) * ITENS_POR_PAGINA;
  const registrosDaPagina = registros.slice(inicio, inicio + ITENS_POR_PAGINA);

  const mensagemVazia = carregando
    ? 'Carregando registros de auditoria...'
    : erro
      ? null
      : 'Nenhum registro de auditoria encontrado.';

  return (
    <div className="grid gap-6">
      {erro && <Alert tone="danger">{erro}</Alert>}

      <Card>
        <div className="flex flex-col gap-3 border-b border-divider px-3.5 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h2 className="text-[15px] font-bold text-text md:text-base">Registros de Auditoria</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Ações registradas no sistema, das mais recentes para as mais antigas.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw size={13} className="mr-1.5" /> Atualizar
          </Button>
        </div>

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
            {registrosDaPagina.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-9 text-center text-slate-500">
                  {mensagemVazia ?? 'Não foi possível exibir os registros.'}
                </td>
              </tr>
            ) : (
              registrosDaPagina.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatarDataHora(r.data_hora)}</td>
                  <td className="whitespace-nowrap">
                    {r.usuario_id === null ? 'Não identificado' : `Usuário #${r.usuario_id}`}
                  </td>
                  <td className="whitespace-nowrap" title={r.modulo}>
                    {LABELS_MODULO_AUDITORIA[r.modulo] ?? r.modulo}
                  </td>
                  <td className="break-all font-mono text-xs text-slate-700">{r.acao}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <Pagination
          currentPage={pagina}
          totalItems={registros.length}
          pageSize={ITENS_POR_PAGINA}
          onPageChange={setPagina}
        />
      </Card>
    </div>
  );
}
