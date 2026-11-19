import { useState } from 'react';
import { Alert, Button, Textarea } from '../../components/ui';
import { LABELS_FASE_ODOMETRO, type FaseOdometro } from '../../types/evidenciaOdometro';
import { mensagemDeErro } from '../../services/api/http';
import { CampoFotoOdometro } from './CampoFotoOdometro';
import type { useFotoOdometro } from './useFotoOdometro';

const formatarData = (valor: string) => {
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

interface SituacaoFotoOdometroProps {
  fase: FaseOdometro;
  foto: ReturnType<typeof useFotoOdometro>;
  disabled: boolean;
}

/** Parte da foto nos modais de iniciar e finalizar: campo, foto já registrada ou exceção. */
export function SituacaoFotoOdometro({ fase, foto, disabled }: SituacaoFotoOdometroProps) {
  const [pedindo, setPedindo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erroPedido, setErroPedido] = useState<string | null>(null);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const enviarPedido = async () => {
    if (motivo.trim().length < 10 || enviandoPedido) return;
    setEnviandoPedido(true);
    setErroPedido(null);
    try {
      await foto.solicitarExcecao(motivo.trim());
      setPedindo(false);
      setMotivo('');
    } catch (erro) {
      setErroPedido(mensagemDeErro(erro));
    } finally {
      setEnviandoPedido(false);
    }
  };
  if (!foto.ativo) return null;
  const rotulo = LABELS_FASE_ODOMETRO[fase].toLowerCase();

  if (foto.consultando) {
    return (
      <p role="status" className="mb-4 text-xs text-slate-500">
        Verificando a foto do odômetro...
      </p>
    );
  }

  const { evidencia } = foto;
  if (evidencia?.situacao === 'REGISTRADA') {
    return (
      <Alert tone="info" className="mb-4">
        A foto do odômetro na {rotulo} deste deslocamento já foi registrada
        {evidencia.compartilhada ? ' em outra coleta do mesmo veículo' : ''}
        {evidencia.registrada_em ? ` em ${formatarData(evidencia.registrada_em)}` : ''}. Não é preciso
        enviar de novo.
      </Alert>
    );
  }
  if (evidencia?.situacao === 'EXCECAO_AUTORIZADA' && evidencia.excecao) {
    return (
      <Alert tone="warning" className="mb-4">
        {LABELS_FASE_ODOMETRO[fase]} autorizada sem foto por {evidencia.excecao.autorizada_por_nome} em{' '}
        {formatarData(evidencia.excecao.autorizada_em)}. Justificativa: {evidencia.excecao.justificativa}
      </Alert>
    );
  }

  return (
    <>
      {foto.erroConsulta && (
        <Alert tone="warning" className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Não foi possível verificar a configuração. O servidor validará a transição.</span>
            <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={disabled || foto.validandoArquivo} onClick={() => void foto.consultar()}>
              Tentar novamente
            </Button>
          </div>
        </Alert>
      )}
      {foto.fotoDisponivel && (
        <CampoFotoOdometro
          fase={fase}
          arquivo={foto.arquivo}
          erro={foto.erroArquivo}
          validando={foto.validandoArquivo}
          onChange={foto.setArquivo}
          obrigatoria={foto.fotoExigida}
          disabled={disabled}
        />
      )}
      {foto.pedido?.status === 'APROVADA' && (
        <Alert tone="success" className="mb-3">
          Autorização aprovada. Informe a quilometragem para registrar a {rotulo}. {foto.pedido.justificativa}
        </Alert>
      )}
      {foto.pedido?.status === 'PENDENTE' && (
        <Alert tone="info" className="mb-3">
          Pedido aguardando decisão do gestor.
          <Button type="button" variant="outline" size="sm" className="ml-2 min-h-11"
            onClick={() => void foto.consultar()} disabled={disabled}>
            Atualizar pedido
          </Button>
        </Alert>
      )}
      {foto.pedido?.status === 'RECUSADA' && (
        <Alert tone="warning" className="mb-3">Pedido recusado. {foto.pedido.justificativa}</Alert>
      )}
      {foto.podeSolicitar && (!foto.pedido || foto.pedido.status === 'RECUSADA') && (
        <section aria-label="Autorização sem foto" className="mb-4">
          {erroPedido && <Alert tone="danger">{erroPedido}</Alert>}
          {pedindo ? (
            <>
              <Textarea label="Motivo para solicitar autorização sem foto" value={motivo} maxLength={500}
                placeholder="Informe pelo menos 10 caracteres" disabled={disabled || enviandoPedido}
                onChange={(evento) => setMotivo(evento.target.value)} />
              <Button type="button" variant="outline" className="min-h-11"
                disabled={disabled || enviandoPedido || motivo.trim().length < 10} onClick={() => void enviarPedido()}>
                {enviandoPedido ? 'Enviando pedido…' : 'Enviar pedido'}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => setPedindo(true)}>
              Solicitar autorização sem foto
            </Button>
          )}
        </section>
      )}
    </>
  );
}
