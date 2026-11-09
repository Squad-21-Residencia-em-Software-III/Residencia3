import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, Select } from '../../components/ui';
import { ApiError } from '../../services/api/http';
import { unidadesApi } from '../../services/api/unidadesApi';
import { LABELS_PERFIS, type Usuario } from '../../types/usuario';
import {
  LABELS_TIPO_UNIDADE,
  PERFIS_GESTORES_POR_UNIDADE,
  type UnidadeComGestores,
} from '../../types/unidade';

interface Props {
  /** Reaproveita o feedback (sucesso/erro) da página de usuários. */
  onFeedback: (mensagem: string, isError?: boolean) => void;
}

function mensagemDeErro(erro: unknown, padrao: string): string {
  if (erro instanceof ApiError) {
    if (erro.status === 400) return `Dados inválidos: ${erro.mensagemCompleta}`;
    if (erro.status === 403) return 'Você não tem permissão para alterar esta associação.';
    if (erro.status === 404) return `Não encontrado: ${erro.mensagemCompleta}`;
    if (erro.status === 409) return `Conflito: ${erro.mensagemCompleta}`;
    return erro.mensagemCompleta;
  }
  return padrao;
}

/**
 * Seção administrativa: consulta e configura os gestores associados a cada unidade.
 * Tudo vem da API (sem estado simulado). Contrato em services/api/unidadesApi.ts.
 */
export function GestoresUnidadesSecao({ onFeedback }: Props) {
  const [unidades, setUnidades] = useState<UnidadeComGestores[]>([]);
  const [candidatos, setCandidatos] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState<number | null>(null); // unidade em operação
  const [remocaoPendente, setRemocaoPendente] = useState<{
    unidade: UnidadeComGestores;
    gestorId: number;
    nomeGestor: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const [listaUnidades, listaCandidatos] = await Promise.all([
        unidadesApi.listarComGestores(),
        unidadesApi.listarCandidatos(),
      ]);
      setUnidades(listaUnidades);
      setCandidatos(listaCandidatos);
    } catch (erro) {
      setErroCarga(mensagemDeErro(erro, 'Não foi possível carregar as unidades e seus gestores.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const candidatosPorUnidade = useMemo(() => {
    const mapa = new Map<number, Usuario[]>();
    for (const u of unidades) {
      // Só perfis que a unidade aceita (ex.: Gestor SVO apenas no SVO) e que ainda não estão associados
      const perfisAceitos = PERFIS_GESTORES_POR_UNIDADE[u.nome] ?? [];
      const jaAssociados = new Set(u.gestores.map((g) => g.id));
      mapa.set(
        u.id,
        candidatos.filter((c) => perfisAceitos.includes(c.perfil) && !jaAssociados.has(c.id)),
      );
    }
    return mapa;
  }, [unidades, candidatos]);

  const associar = async (unidade: UnidadeComGestores) => {
    const gestorId = Number(selecionado[unidade.id]);
    if (!gestorId) {
      onFeedback('Selecione um gestor para associar à unidade.', true);
      return;
    }
    setOcupado(unidade.id);
    try {
      // O 201 devolve a unidade atualizada: substitui só ela, sem recarregar tudo
      const atualizada = await unidadesApi.associarGestor(unidade.id, gestorId);
      setUnidades((lista) => lista.map((u) => (u.id === atualizada.id ? atualizada : u)));
      setSelecionado((s) => ({ ...s, [unidade.id]: '' }));
      onFeedback(`Gestor associado à unidade "${unidade.nome}" com sucesso.`);
    } catch (erro) {
      onFeedback(mensagemDeErro(erro, 'Não foi possível associar o gestor.'), true);
    } finally {
      setOcupado(null);
    }
  };

  const confirmarRemover = async () => {
    if (!remocaoPendente) return;
    const { unidade, gestorId } = remocaoPendente;
    setOcupado(unidade.id);
    try {
      await unidadesApi.removerGestor(unidade.id, gestorId);
      await carregar();
      onFeedback(`Gestor removido da unidade "${unidade.nome}".`);
    } catch (erro) {
      onFeedback(mensagemDeErro(erro, 'Não foi possível remover a associação.'), true);
    } finally {
      setOcupado(null);
      setRemocaoPendente(null);
    }
  };

  return (
    <Card>
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="text-base font-bold text-slate-900">Gestores por unidade</div>
        <div className="mt-1 text-xs text-slate-500">
          Gestores responsáveis pela aprovação das solicitações de cada unidade.
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4">
        {carregando && <div className="text-slate-500">Carregando unidades...</div>}

        {!carregando && erroCarga && (
          <div className="flex flex-wrap items-center gap-2 text-rose-700">
            <AlertCircle size={18} className="shrink-0" />
            <span className="text-sm font-semibold">{erroCarga}</span>
            <Button variant="ghost" size="sm" onClick={carregar}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!carregando && !erroCarga && unidades.length === 0 && (
          <div className="text-slate-500">Nenhuma unidade cadastrada.</div>
        )}

        {!carregando &&
          !erroCarga &&
          unidades.map((unidade) => {
            const disponiveis = candidatosPorUnidade.get(unidade.id) ?? [];
            const emOperacao = ocupado === unidade.id;
            return (
              <div
                key={unidade.id}
                className="grid gap-3 rounded-md border border-slate-200 px-4 py-3.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{unidade.nome}</span>
                  <Badge tone="neutral">{LABELS_TIPO_UNIDADE[unidade.tipo] ?? unidade.tipo}</Badge>
                </div>

                {unidade.gestores.length === 0 ? (
                  <div className="text-[13px] font-semibold text-amber-700">
                    Nenhum gestor associado a esta unidade.
                  </div>
                ) : (
                  <div className="grid gap-1.5">
                    {unidade.gestores.map((g) => (
                      <div key={g.id} className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{g.nome}</span>
                        <span className="text-xs text-slate-500">{g.email}</span>
                        {!g.ativo && <Badge tone="neutral">Inativo</Badge>}
                        <Button
                          variant="danger-outline"
                          size="sm"
                          disabled={emOperacao}
                          className="ml-auto"
                          onClick={() =>
                            setRemocaoPendente({
                              unidade,
                              gestorId: g.id,
                              nomeGestor: g.nome,
                            })
                          }
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <div className="max-w-[380px] min-w-[240px] flex-1">
                    <Select
                      aria-label={`Gestor a associar à unidade ${unidade.nome}`}
                      value={selecionado[unidade.id] ?? ''}
                      disabled={emOperacao || disponiveis.length === 0}
                      onChange={(e) =>
                        setSelecionado((s) => ({ ...s, [unidade.id]: e.target.value }))
                      }
                    >
                      <option value="">
                        {disponiveis.length === 0
                          ? 'Nenhum gestor disponível'
                          : 'Selecione um gestor...'}
                      </option>
                      {disponiveis.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} — {LABELS_PERFIS[c.perfil]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    disabled={emOperacao || !selecionado[unidade.id]}
                    onClick={() => associar(unidade)}
                  >
                    Associar
                  </Button>
                </div>
              </div>
            );
          })}
      </div>

      <ConfirmDialog
        isOpen={Boolean(remocaoPendente)}
        title="Remover Gestor da Unidade"
        description={
          remocaoPendente
            ? `Tem certeza que deseja remover "${remocaoPendente.nomeGestor}" da unidade "${remocaoPendente.unidade.nome}"?`
            : ''
        }
        confirmLabel="Sim, Remover"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={Boolean(remocaoPendente && ocupado === remocaoPendente.unidade.id)}
        onConfirm={confirmarRemover}
        onClose={() => setRemocaoPendente(null)}
      />
    </Card>
  );
}
