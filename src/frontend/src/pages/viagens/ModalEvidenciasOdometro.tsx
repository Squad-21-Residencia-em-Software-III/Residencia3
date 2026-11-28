import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Alert, Badge, Button, Modal, type BadgeTone } from '../../components/ui';
import { evidenciasOdometroApi } from '../../services/api/evidenciasOdometroApi';
import { ApiError, mensagemDeErro } from '../../services/api/http';
import { salvarBlobNoNavegador } from '../../services/api/relatoriosApi';
import {
  LABELS_FASE_ODOMETRO,
  type EvidenciaOdometro,
  type EvidenciasDaViagem,
  type SituacaoEvidencia,
} from '../../types/evidenciaOdometro';
import type { TipoOperacaoViagem } from '../../types/viagem';

export interface ReferenciaEvidencias {
  id: number;
  tipo_operacao: TipoOperacaoViagem;
}

const SITUACOES: Record<SituacaoEvidencia, { rotulo: string; tom: BadgeTone }> = {
  REGISTRADA: { rotulo: 'Foto registrada', tom: 'success' },
  EXCECAO_AUTORIZADA: { rotulo: 'Autorizada sem foto', tom: 'warning' },
  EXPIRADA: { rotulo: 'Foto expirada', tom: 'neutral' },
  SEM_REGISTRO: { rotulo: 'Registro anterior', tom: 'neutral' },
  PENDENTE: { rotulo: 'Não registrada', tom: 'info' },
};

const formatarData = (valor: string | null) => {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function mensagemDeFalha(erro: unknown): string {
  if (erro instanceof ApiError && erro.status === 403) {
    return 'Você não tem permissão para ver as fotos desta viagem.';
  }
  if (erro instanceof ApiError && erro.status === 404) {
    return 'Viagem não encontrada ou fotos indisponíveis.';
  }
  return mensagemDeErro(erro);
}

/** Uma fase (saída ou chegada): foto pelo proxy autenticado, com o contexto do registro. */
function CartaoEvidencia({ evidencia, referencia }: { evidencia: EvidenciaOdometro; referencia: ReferenciaEvidencias }) {
  const fase = LABELS_FASE_ODOMETRO[evidencia.fase];
  const situacao = SITUACOES[evidencia.situacao];
  const temArquivo = evidencia.situacao === 'REGISTRADA' && evidencia.id !== null;
  const [url, setUrl] = useState<string | null>(null);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    if (!temArquivo || !evidencia.id) return;
    let ativo = true;
    let criada: string | null = null;
    setErroFoto(null);
    evidenciasOdometroApi
      .arquivo(evidencia.id)
      .then(({ blob }) => {
        if (!ativo) return;
        criada = URL.createObjectURL(blob);
        setUrl(criada);
      })
      .catch((e) => {
        if (ativo) setErroFoto(mensagemDeFalha(e));
      });
    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [temArquivo, evidencia.id]);

  const baixar = async () => {
    if (!evidencia.id) return;
    setBaixando(true);
    try {
      const { blob, filename } = await evidenciasOdometroApi.arquivo(evidencia.id, true);
      const nomePadrao = `odometro-${referencia.tipo_operacao.toLowerCase()}-${referencia.id}-${evidencia.fase.toLowerCase()}`;
      salvarBlobNoNavegador(blob, filename ?? nomePadrao);
    } catch (e) {
      setErroFoto(mensagemDeFalha(e));
    } finally {
      setBaixando(false);
    }
  };

  return (
    <section aria-label={`Odômetro na ${fase.toLowerCase()}`} className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{fase}</h3>
        <Badge tone={situacao.tom}>{situacao.rotulo}</Badge>
      </div>

      {temArquivo &&
        (url ? (
          <img
            src={url}
            alt={`Foto do odômetro na ${fase.toLowerCase()} da viagem #${referencia.id}`}
            className="mb-2 max-h-72 w-full rounded-md border border-slate-200 bg-slate-50 object-contain"
          />
        ) : erroFoto ? null : (
          <p role="status" className="mb-2 text-xs text-slate-500">Carregando foto...</p>
        ))}

      {erroFoto && (
        <Alert tone="danger" className="mb-2">
          {erroFoto}
        </Alert>
      )}

      {evidencia.situacao === 'EXCECAO_AUTORIZADA' && evidencia.excecao && (
        <p className="mb-2 text-xs text-slate-700">
          Transição autorizada sem foto por <strong>{evidencia.excecao.autorizada_por_nome}</strong> em{' '}
          {formatarData(evidencia.excecao.autorizada_em)}. Justificativa: {evidencia.excecao.justificativa}
        </p>
      )}
      {evidencia.situacao === 'EXPIRADA' && (
        <p className="mb-2 text-xs text-slate-700">
          A foto foi descartada após o prazo de guarda de 12 meses. O registro da {fase.toLowerCase()} continua.
        </p>
      )}
      {evidencia.situacao === 'SEM_REGISTRO' && (
        <p className="mb-2 text-xs text-slate-700">
          Viagem registrada antes da comprovação por foto: não há evidência deste registro.
        </p>
      )}
      {evidencia.situacao === 'PENDENTE' && (
        <p className="mb-2 text-xs text-slate-700">A {fase.toLowerCase()} ainda não foi registrada.</p>
      )}
      {evidencia.compartilhada && (
        <p className="mb-2 text-xs text-slate-500">
          Foto do deslocamento compartilhado: vale para todas as coletas desse trajeto.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Km informado</dt>
        <dd className="font-semibold text-slate-900">
          {evidencia.km === null ? '—' : `${evidencia.km.toLocaleString('pt-BR')} km`}
        </dd>
        <dt className="text-slate-500">Registrada em</dt>
        <dd className="text-slate-900">{formatarData(evidencia.registrada_em)}</dd>
        <dt className="text-slate-500">Registrada por</dt>
        <dd className="text-slate-900">{evidencia.autor_nome ?? '—'}</dd>
      </dl>

      {temArquivo && evidencia.pode_baixar && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-11 w-full justify-center sm:w-auto"
          disabled={baixando}
          onClick={() => void baixar()}
        >
          <Download size={13} className="mr-1.5" /> {baixando ? 'Baixando...' : 'Baixar original'}
        </Button>
      )}
    </section>
  );
}

interface ModalEvidenciasOdometroProps {
  referencia: ReferenciaEvidencias;
  onClose: () => void;
}

/**
 * Fotos do odômetro de uma viagem ou coleta (SCRUM-207). O servidor decide quem vê: Administrador
 * nas duas operações, Gestor de Frota só nas administrativas e Gestor SVO só nas SVO.
 */
export function ModalEvidenciasOdometro({ referencia, onClose }: ModalEvidenciasOdometroProps) {
  const [dados, setDados] = useState<EvidenciasDaViagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro(null);
    evidenciasOdometroApi
      .consultar(referencia)
      .then((resposta) => {
        if (ativo) setDados(resposta);
      })
      .catch((e) => {
        if (ativo) setErro(mensagemDeFalha(e));
      });
    return () => {
      ativo = false;
    };
  }, [referencia]);

  const operacao = referencia.tipo_operacao === 'SVO' ? 'Coleta SVO' : 'Viagem administrativa';

  return (
    <Modal title={`Fotos do odômetro · ${operacao} #${referencia.id}`} onClose={onClose} maxWidth="720px">
      {erro && <Alert tone="danger">{erro}</Alert>}
      {!erro && !dados && (
        <p role="status" className="text-sm text-slate-500">
          Carregando fotos...
        </p>
      )}
      {dados && (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Veículo <strong>{dados.veiculo_placa ?? '—'}</strong> · Motorista{' '}
            <strong>{dados.motorista_nome ?? '—'}</strong>
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CartaoEvidencia evidencia={dados.saida} referencia={referencia} />
            <CartaoEvidencia evidencia={dados.chegada} referencia={referencia} />
          </div>
        </>
      )}
    </Modal>
  );
}
