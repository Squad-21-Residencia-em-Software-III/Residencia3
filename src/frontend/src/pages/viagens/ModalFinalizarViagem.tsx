import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Check } from 'lucide-react';
import { Alert, Button, Input, Modal } from '../../components/ui';
import type { Viagem } from '../../types/viagem';
import { cn } from '../../utils/cn';
import { CLASSES_ACOES_FOLHA } from './acoesFolha';
import { ERRO_LIMITE_ODOMETRO, KM_ODOMETRO_MAXIMO } from './limiteOdometro';
import { SituacaoFotoOdometro } from './SituacaoFotoOdometro';
import { mensagemFalhaTransicao, useFotoOdometro } from './useFotoOdometro';

interface ModalFinalizarViagemProps {
  viagem: Viagem;
  onClose: () => void;
  /** `evidenciaId`: foto da chegada já enviada (SCRUM-206), quando `fotosOdometro` está ligado. */
  onSalvar: (kmFinal: number, evidenciaId?: string) => Promise<void>;
  /** Motorista no celular: folha inferior, dados essenciais e botões maiores. */
  compacto?: boolean;
}

export function ModalFinalizarViagem({ viagem, onClose, onSalvar, compacto = false }: ModalFinalizarViagemProps) {
  const kmInicial = viagem.km_inicial ?? 0;

  const [kmFinal, setKmFinal] = useState<string>('');
  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  const [falhaAoSalvar, setFalhaAoSalvar] = useState(false);
  const envioEmCurso = useRef(false);
  const foto = useFotoOdometro(viagem, 'CHEGADA');

  const kmFinalNum = Number(kmFinal);
  const kmRodados = kmFinal && Number.isInteger(kmFinalNum)
    && kmFinalNum >= kmInicial && kmFinalNum <= KM_ODOMETRO_MAXIMO
    ? kmFinalNum - kmInicial
    : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (envioEmCurso.current || foto.consultando || foto.validandoArquivo) return;
    setErro('');
    setFalhaAoSalvar(false);

    if (!kmFinal || !Number.isInteger(kmFinalNum)) {
      setErro('Informe o odômetro final como um número inteiro.');
      return;
    }

    if (kmFinalNum < kmInicial) {
      setErro(
        `O odômetro final (${kmFinalNum} km) não pode ser menor que o odômetro inicial (${kmInicial} km).`,
      );
      return;
    }
    if (kmFinalNum > KM_ODOMETRO_MAXIMO) {
      setErro(ERRO_LIMITE_ODOMETRO);
      return;
    }
    if (foto.fotoExigida && !foto.arquivo) {
      setErro('Tire ou carregue a foto do odômetro na chegada.');
      return;
    }

    envioEmCurso.current = true;
    setSalvando(true);
    try {
      const evidenciaId = await foto.obterEvidenciaId();
      if (evidenciaId) await onSalvar(kmFinalNum, evidenciaId);
      else await onSalvar(kmFinalNum);
      onClose();
    } catch (error) {
      foto.tratarErroTransicao(error);
      setErro(mensagemFalhaTransicao(error, 'chegada'));
      setFalhaAoSalvar(true);
      envioEmCurso.current = false;
      setSalvando(false);
    }
  };

  return (
    <Modal
      title={`Registrar Retorno da Viagem #${viagem.id}`}
      onClose={onClose}
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
          <div className="mt-1 text-xs font-semibold text-primary">
            Odômetro de saída (Km inicial): {kmInicial.toLocaleString('pt-BR')} km
          </div>
        </div>

        <Input
          label="Odômetro Final (Km de Retorno) *"
          type="number"
          inputMode="numeric"
          className={cn('min-h-11 text-base md:text-sm', compacto && 'min-h-13 text-xl font-bold md:text-xl')}
          placeholder={`Maior que ${kmInicial}`}
          value={kmFinal}
          readOnly={salvando}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmFinal(e.target.value)}
          min={kmInicial}
          max={KM_ODOMETRO_MAXIMO}
          required
        />

        {kmRodados !== null && (
          <div className="-mt-2 mb-4 flex items-center gap-1.5 rounded-md bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700">
            <Check size={13} aria-hidden="true" /> Distância percorrida apurada:{' '}
            {kmRodados.toLocaleString('pt-BR')} km
          </div>
        )}

        <SituacaoFotoOdometro fase="CHEGADA" foto={foto} disabled={salvando} />

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
              Cancelar
            </Button>
          )}
          <Button
            type="submit"
            disabled={foto.consultando || foto.validandoArquivo}
            aria-disabled={salvando || undefined}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          >
            {salvando ? (foto.enviando ? 'Enviando foto...' : 'Concluindo...') : falhaAoSalvar ? 'Tentar novamente' : compacto ? 'Confirmar chegada' : 'Confirmar Chegada e Concluir'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
