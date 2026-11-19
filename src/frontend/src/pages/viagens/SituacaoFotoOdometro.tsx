import { Alert, Button } from '../../components/ui';
import { LABELS_FASE_ODOMETRO, type FaseOdometro } from '../../types/evidenciaOdometro';
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
            <span>Não foi possível verificar a situação da foto. Ela continua obrigatória.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void foto.consultar()}>
              Tentar novamente
            </Button>
          </div>
        </Alert>
      )}
      <CampoFotoOdometro fase={fase} arquivo={foto.arquivo} onChange={foto.setArquivo} disabled={disabled} />
      <p className="-mt-2 mb-4 text-xs text-slate-500">
        Sem foto, a {rotulo} só pode ser registrada com autorização do gestor responsável pela operação.
      </p>
    </>
  );
}
