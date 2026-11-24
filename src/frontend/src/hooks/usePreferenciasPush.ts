import { useCallback, useEffect, useRef, useState } from 'react';
import { mensagemDeErro } from '../services/api/http';
import { notificacoesPushApi, type CategoriaNotificacao } from '../services/api/notificacoesPushApi';

/** Categorias que o usuário quer receber. Valem para a conta, em todos os aparelhos. */
export function usePreferenciasPush(usuarioId: number | undefined, online: boolean) {
  const [categorias, setCategorias] = useState<CategoriaNotificacao[] | null>(null);
  const [salvando, setSalvando] = useState<ReadonlySet<string>>(() => new Set());
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const emEnvio = useRef(new Set<string>());
  const consulta = useRef(0);
  const usuarioAtual = useRef(usuarioId);

  const carregar = useCallback(async () => {
    const atual = ++consulta.current;
    setErroCarga(null);
    try {
      const { categorias: lista } = await notificacoesPushApi.preferencias();
      if (atual === consulta.current) setCategorias(lista);
    } catch (e) {
      if (atual === consulta.current) setErroCarga(mensagemDeErro(e));
    }
  }, []);

  useEffect(() => {
    usuarioAtual.current = usuarioId;
    consulta.current += 1;
    setCategorias(null);
    setErroCarga(null);
    setErro(null);
  }, [usuarioId]);

  // Ao voltar a conexão, só carrega se ainda não houver lista na tela
  const temLista = categorias !== null;
  useEffect(() => {
    if (online && !temLista) void carregar();
  }, [usuarioId, online, temLista, carregar]);

  const alternar = async ({ codigo, push }: CategoriaNotificacao) => {
    if (emEnvio.current.has(codigo)) return;
    const dono = usuarioId;
    emEnvio.current.add(codigo);
    setSalvando(new Set(emEnvio.current));
    setErro(null);
    const aplicar = (valor: boolean) =>
      setCategorias((lista) => lista?.map((c) => (c.codigo === codigo ? { ...c, push: valor } : c)) ?? null);
    aplicar(!push);
    try {
      const salva = await notificacoesPushApi.salvarPreferencia(codigo, !push);
      if (usuarioAtual.current === dono) aplicar(salva?.push ?? !push);
    } catch (e) {
      if (usuarioAtual.current === dono) {
        aplicar(push);
        setErro(mensagemDeErro(e));
      }
    } finally {
      emEnvio.current.delete(codigo);
      setSalvando(new Set(emEnvio.current));
    }
  };

  return { categorias, salvando, erroCarga, erro, carregar, alternar };
}
