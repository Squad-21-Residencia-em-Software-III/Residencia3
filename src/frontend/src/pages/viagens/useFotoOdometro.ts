import { useCallback, useEffect, useRef, useState } from 'react';
import { recursoAtivo } from '../../config/recursosBackend';
import { evidenciasOdometroApi } from '../../services/api/evidenciasOdometroApi';
import { ApiError, CODIGO_CANCELADO, mensagemDeErro } from '../../services/api/http';
import {
  CODIGOS_REENVIAR_FOTO,
  LABELS_FASE_ODOMETRO,
  type EvidenciaOdometro,
  type FaseOdometro,
} from '../../types/evidenciaOdometro';
import type { Viagem } from '../../types/viagem';
import { novaChaveIdempotencia, validarFotoOdometro } from '../../utils/fotoOdometro';

/**
 * Foto do odômetro de uma fase (SCRUM-205/206). A foto é enviada antes da transição e o id
 * devolvido acompanha o iniciar/finalizar. Se a transição falhar, a mesma foto não é enviada
 * de novo: o id é reaproveitado, a menos que o servidor diga que ele não vale mais.
 *
 * A foto deixa de ser pedida só quando o servidor informa que a fase já tem evidência
 * (deslocamento SVO compartilhado) ou que o gestor autorizou a transição sem foto. Se a consulta
 * falhar, a foto continua obrigatória.
 */
export function useFotoOdometro(viagem: Pick<Viagem, 'id' | 'tipo_operacao'>, fase: FaseOdometro) {
  const ativo = recursoAtivo('fotosOdometro');
  const [evidencia, setEvidencia] = useState<EvidenciaOdometro | null>(null);
  const [consultando, setConsultando] = useState(ativo);
  const [erroConsulta, setErroConsulta] = useState<string | null>(null);
  const [arquivo, setArquivoAtual] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [validandoArquivo, setValidandoArquivo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const chave = useRef<string>(novaChaveIdempotencia());
  const enviada = useRef<{ arquivo: File; id: string } | null>(null);
  const envio = useRef<AbortController | null>(null);

  const consultar = useCallback(async () => {
    if (!ativo) return;
    setConsultando(true);
    setErroConsulta(null);
    try {
      const resposta = await evidenciasOdometroApi.consultar(viagem);
      setEvidencia(fase === 'SAIDA' ? resposta.saida : resposta.chegada);
    } catch (e) {
      setEvidencia(null);
      setErroConsulta(mensagemDeErro(e));
    } finally {
      setConsultando(false);
    }
  }, [ativo, fase, viagem]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  // Fecha o modal no meio do envio: a requisição é cancelada
  useEffect(() => () => envio.current?.abort(), []);

  const fotoDispensada =
    evidencia?.situacao === 'REGISTRADA' || evidencia?.situacao === 'EXCECAO_AUTORIZADA';
  const fotoExigida = ativo && !fotoDispensada;

  const setArquivo = async (novo: File | null) => {
    setErroArquivo(null);
    if (novo) {
      setValidandoArquivo(true);
      const problema = await validarFotoOdometro(novo);
      setValidandoArquivo(false);
      if (problema) {
        setErroArquivo(problema);
        return;
      }
    }
    setArquivoAtual(novo);
    // Outra foto é outra evidência
    enviada.current = null;
    chave.current = novaChaveIdempotencia();
  };

  /** Id da foto para a transição, enviando-a se ainda não foi. `undefined` quando não se aplica. */
  const obterEvidenciaId = async (): Promise<string | undefined> => {
    if (!fotoExigida) return undefined;
    if (!arquivo) {
      throw new Error(`Tire ou carregue a foto do odômetro na ${LABELS_FASE_ODOMETRO[fase].toLowerCase()}.`);
    }
    if (enviada.current?.arquivo === arquivo) return enviada.current.id;

    const controle = new AbortController();
    envio.current = controle;
    setEnviando(true);
    try {
      const resposta = await evidenciasOdometroApi.enviar(viagem, fase, arquivo, {
        chaveIdempotencia: chave.current,
        signal: controle.signal,
      });
      enviada.current = { arquivo, id: resposta.id };
      return resposta.id;
    } finally {
      envio.current = null;
      setEnviando(false);
    }
  };

  /** Erro da transição: se a foto não vale mais, a próxima tentativa envia de novo. */
  const tratarErroTransicao = (erro: unknown) => {
    if (erro instanceof ApiError && (CODIGOS_REENVIAR_FOTO as readonly string[]).includes(erro.codigo ?? '')) {
      enviada.current = null;
      chave.current = novaChaveIdempotencia();
    }
  };

  return {
    ativo,
    evidencia,
    consultando,
    erroConsulta,
    consultar,
    fotoExigida,
    arquivo,
    erroArquivo,
    validandoArquivo,
    setArquivo,
    enviando,
    cancelarEnvio: () => envio.current?.abort(),
    obterEvidenciaId,
    tratarErroTransicao,
  };
}

/** Uma falha de rede pode ocorrer depois que o servidor recebeu a transição. */
export function mensagemFalhaTransicao(erro: unknown, acao: string): string {
  if (erro instanceof ApiError && erro.codigo === CODIGO_CANCELADO) {
    return `O envio da foto foi cancelado. A ${acao} não foi registrada.`;
  }
  if (erro instanceof ApiError && erro.status === 0) {
    return `${erro.message} A ${acao} não foi confirmada; seus dados continuam aqui para tentar de novo.`;
  }
  return mensagemDeErro(erro);
}
