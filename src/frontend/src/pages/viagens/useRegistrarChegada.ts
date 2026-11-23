import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ApiError, mensagemDeErro } from '../../services/api/http';
import { viagensApi } from '../../services/api/viagensApi';
import { chaveViagem, type Viagem } from '../../types/viagem';

interface OpcoesRegistrarChegada {
  habilitado: boolean;
  setViagens: Dispatch<SetStateAction<Viagem[]>>;
  exibirFeedback: (mensagem: string, erro?: boolean) => void;
}

/** "Cheguei ao local" da coleta SVO (BL31), com proteção contra toque duplo. */
export function useRegistrarChegada({ habilitado, setViagens, exibirFeedback }: OpcoesRegistrarChegada) {
  const chegadasEmEnvio = useRef(new Set<number>());
  const [chegadasPendentes, setChegadasPendentes] = useState<ReadonlySet<number>>(() => new Set());

  const registrarChegada = async (viagem: Viagem) => {
    const { id, status, tipo_operacao } = viagem;
    const envios = chegadasEmEnvio.current;
    if (!habilitado || tipo_operacao !== 'SVO' || status !== 'EM_ANDAMENTO' || envios.has(id)) return;

    const chave = chaveViagem(viagem);
    envios.add(id);
    setChegadasPendentes(new Set(envios));

    try {
      const atualizada = await viagensApi.registrarChegadaLocalSvo(id);
      if (atualizada?.status !== 'NO_LOCAL' || chaveViagem(atualizada) !== chave) {
        throw new Error('O servidor não confirmou a chegada. Consulte o status da coleta.');
      }
      setViagens((lista) => lista.map((v) => chaveViagem(v) === chave ? atualizada : v));
      exibirFeedback('Chegada ao local registrada.');
    } catch (error) {
      const statusHttp = error instanceof ApiError ? error.status : undefined;
      const mensagem =
        statusHttp !== undefined && statusHttp >= 500
          ? 'O servidor não conseguiu confirmar a chegada. Tente novamente.'
          : mensagemDeErro(error);
      if (statusHttp === 409 || statusHttp === 404) {
        try {
          const listaAtual = await viagensApi.listar();
          const coletaAtual = listaAtual.find((v) => chaveViagem(v) === chave);
          setViagens((lista) => lista.flatMap((v) =>
            chaveViagem(v) === chave ? (coletaAtual ? [coletaAtual] : []) : [v],
          ));
        } catch {
          exibirFeedback(`${mensagem} Não foi possível atualizar o status da coleta.`, true);
          return;
        }
      }
      exibirFeedback(mensagem, true);
    } finally {
      envios.delete(id);
      setChegadasPendentes(new Set(envios));
    }
  };

  return { chegadasPendentes, registrarChegada };
}
