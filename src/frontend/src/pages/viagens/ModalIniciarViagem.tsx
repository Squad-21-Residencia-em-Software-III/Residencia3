import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal } from '../../components/ui';
import type { Viagem } from '../../types/viagem';
import { cn } from '../../utils/cn';
import { CLASSES_ACOES_FOLHA } from './acoesFolha';
import { ERRO_LIMITE_ODOMETRO, KM_ODOMETRO_MAXIMO } from './limiteOdometro';
import { SituacaoFotoOdometro } from './SituacaoFotoOdometro';
import { mensagemFalhaTransicao, useFotoOdometro } from './useFotoOdometro';

interface ModalIniciarViagemProps {
  viagem: Viagem;
  onClose: () => void;
  /** `evidenciaId`: foto da saída já enviada (SCRUM-205), quando `fotosOdometro` está ligado. */
  onSalvar: (kmInicial: number, evidenciaId?: string) => Promise<void>;
  /** Motorista no celular: folha inferior, dados essenciais e botões maiores. */
  compacto?: boolean;
  /** Km atual do veículo, só como referência do valor mínimo. */
  kmReferencia?: number;
}

export function ModalIniciarViagem({ viagem, onClose, onSalvar, compacto = false, kmReferencia }: ModalIniciarViagemProps) {
  const [kmInicial, setKmInicial] = useState<string>('');
  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  const [falhaAoSalvar, setFalhaAoSalvar] = useState(false);
  const envioEmCurso = useRef(false);
  const foto = useFotoOdometro(viagem, 'SAIDA');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (envioEmCurso.current || foto.consultando || foto.validandoArquivo) return;
    setErro('');
    setFalhaAoSalvar(false);

    const kmInicialNum = Number(kmInicial);
    if (!kmInicial || !Number.isInteger(kmInicialNum) || kmInicialNum < 0) {
      setErro('Informe o odômetro de saída como um número inteiro.');
      return;
    }
    if (kmInicialNum > KM_ODOMETRO_MAXIMO) {
      setErro(ERRO_LIMITE_ODOMETRO);
      return;
    }
    if (foto.fotoExigida && !foto.arquivo) {
      setErro('Tire ou carregue a foto do odômetro na saída.');
      return;
    }

    envioEmCurso.current = true;
    setSalvando(true);
    try {
      const evidenciaId = await foto.obterEvidenciaId();
      if (evidenciaId) await onSalvar(kmInicialNum, evidenciaId);
      else await onSalvar(kmInicialNum);
      onClose();
    } catch (error) {
      foto.tratarErroTransicao(error);
      setErro(mensagemFalhaTransicao(error, 'saída'));
      setFalhaAoSalvar(true);
      envioEmCurso.current = false;
      setSalvando(false);
    }
  };

  return (
    <Modal
      title={`Iniciar Viagem #${viagem.id}`}
      onClose={onClose}
      telaInteira
      gerenciarFoco
      ajustarAoTeclado
      bloquearFechamento={salvando}
      folhaInferior={compacto}
    >
      <form noValidate onSubmit={handleSubmit}>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[0.8125rem]">
          <div className="font-bold text-slate-900">
            {compacto && !viagem.origem ? '' : `${viagem.origem ?? '—'} → `}{viagem.destino ?? '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Veículo:{' '}
            <strong>
              {viagem.veiculo_modelo} ({viagem.veiculo_placa})
            </strong>
            {!compacto && (
              <>
                {' '}
                • Motorista: <strong>{viagem.motorista_nome}</strong>
              </>
            )}
          </div>
        </div>

        <Input
          label="Odômetro de Saída (Km Inicial) *"
          type="number"
          inputMode="numeric"
          className={cn('min-h-11 text-base md:text-sm', compacto && 'min-h-13 text-xl font-bold md:text-xl')}
          placeholder={kmReferencia ? `Último km: ${kmReferencia}` : 'Ex: 35000'}
          value={kmInicial}
          readOnly={salvando}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmInicial(e.target.value)}
          min={0}
          max={KM_ODOMETRO_MAXIMO}
          required
        />

        <SituacaoFotoOdometro fase="SAIDA" foto={foto} disabled={salvando} />

        {foto.enviando && (
          <p role="status" className="mb-3 text-xs font-semibold text-primary">
            Enviando a foto... Em rede lenta isso pode levar alguns segundos.
          </p>
        )}

        <div
          className={
            compacto
              ? CLASSES_ACOES_FOLHA
              : 'mt-4 flex flex-col gap-2 md:mt-5 md:flex-row md:justify-end md:gap-3 [&>button]:min-h-11'
          }
        >
          {foto.enviando ? (
            <Button variant="ghost" type="button" onClick={foto.cancelarEnvio}>
              Cancelar envio
            </Button>
          ) : (
            <Button variant="ghost" type="button" onClick={onClose} disabled={salvando}>
              Voltar
            </Button>
          )}
          <Button
            type="submit"
            disabled={foto.consultando || foto.validandoArquivo}
            aria-disabled={salvando || undefined}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          >
            {salvando ? (foto.enviando ? 'Enviando foto...' : 'Iniciando...') : falhaAoSalvar ? 'Tentar novamente' : 'Confirmar Saída'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
