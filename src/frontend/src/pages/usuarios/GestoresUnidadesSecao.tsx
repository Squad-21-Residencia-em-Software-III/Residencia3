import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Badge, Button, Card, Select } from '../../components/ui';
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

  const remover = async (unidade: UnidadeComGestores, gestorId: number, nomeGestor: string) => {
    if (!window.confirm(`Remover "${nomeGestor}" da unidade "${unidade.nome}"?`)) return;
    setOcupado(unidade.id);
    try {
      await unidadesApi.removerGestor(unidade.id, gestorId);
      await carregar();
      onFeedback(`Gestor removido da unidade "${unidade.nome}".`);
    } catch (erro) {
      onFeedback(mensagemDeErro(erro, 'Não foi possível remover a associação.'), true);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Card>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-text)' }}>Gestores por unidade</div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          Gestores responsáveis pela aprovação das solicitações de cada unidade.
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'grid', gap: '16px' }}>
        {carregando && <div style={{ color: 'var(--color-text-muted)' }}>Carregando unidades...</div>}

        {!carregando && erroCarga && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', flexWrap: 'wrap' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{erroCarga}</span>
            <Button variant="ghost" size="sm" onClick={carregar}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!carregando && !erroCarga && unidades.length === 0 && (
          <div style={{ color: 'var(--color-text-muted)' }}>Nenhuma unidade cadastrada.</div>
        )}

        {!carregando &&
          !erroCarga &&
          unidades.map((unidade) => {
            const disponiveis = candidatosPorUnidade.get(unidade.id) ?? [];
            const emOperacao = ocupado === unidade.id;
            return (
              <div
                key={unidade.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 16px',
                  display: 'grid',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{unidade.nome}</span>
                  <Badge tone="neutral">{LABELS_TIPO_UNIDADE[unidade.tipo] ?? unidade.tipo}</Badge>
                </div>

                {unidade.gestores.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--color-warning)', fontWeight: 600 }}>
                    Nenhum gestor associado a esta unidade.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {unidade.gestores.map((g) => (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', color: 'var(--color-text)', fontWeight: 600 }}>{g.nome}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{g.email}</span>
                        {!g.ativo && <Badge tone="neutral">Inativo</Badge>}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={emOperacao}
                          style={{ color: 'var(--color-danger)', marginLeft: 'auto' }}
                          onClick={() => remover(unidade, g.id, g.nome)}
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: '240px', flex: 1, maxWidth: '380px' }}>
                    <Select
                      aria-label={`Gestor a associar à unidade ${unidade.nome}`}
                      value={selecionado[unidade.id] ?? ''}
                      disabled={emOperacao || disponiveis.length === 0}
                      onChange={(e) => setSelecionado((s) => ({ ...s, [unidade.id]: e.target.value }))}
                    >
                      <option value="">
                        {disponiveis.length === 0 ? 'Nenhum gestor disponível' : 'Selecione um gestor...'}
                      </option>
                      {disponiveis.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} — {LABELS_PERFIS[c.perfil]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button size="sm" disabled={emOperacao || !selecionado[unidade.id]} onClick={() => associar(unidade)}>
                    Associar
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
    </Card>
  );
}
