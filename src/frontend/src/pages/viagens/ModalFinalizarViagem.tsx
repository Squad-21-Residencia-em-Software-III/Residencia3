import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Check } from 'lucide-react';
import { Alert, Button, Input, Modal } from '../../components/ui';
import type { Viagem } from '../../types/viagem';
import { SituacaoFotoOdometro } from './SituacaoFotoOdometro';
import { mensagemFalhaTransicao, useFotoOdometro } from './useFotoOdometro';

interface ModalFinalizarViagemProps {
  viagem: Viagem;
  onClose: () => void;
  /** `evidenciaId`: foto da chegada já enviada (SCRUM-206), quando `fotosOdometro` está ligado. */
  onSalvar: (kmFinal: number, evidenciaId?: string) => Promise<void>;
}

export function ModalFinalizarViagem({ viagem, onClose, onSalvar }: ModalFinalizarViagemProps) {
  const kmInicial = viagem.km_inicial ?? 0;

  const [kmFinal, setKmFinal] = useState<string>('');
  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  const foto = useFotoOdometro(viagem, 'CHEGADA');

  const kmFinalNum = Number(kmFinal);
  const kmRodados =
    kmFinal && !isNaN(kmFinalNum) && kmFinalNum >= kmInicial ? kmFinalNum - kmInicial : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    setErro('');

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
    if (foto.fotoExigida && !foto.arquivo) {
      setErro('Tire ou carregue a foto do odômetro na chegada.');
      return;
    }

    setSalvando(true);
    try {
      const evidenciaId = await foto.obterEvidenciaId();
      if (evidenciaId) await onSalvar(kmFinalNum, evidenciaId);
      else await onSalvar(kmFinalNum);
      onClose();
    } catch (error) {
      foto.tratarErroTransicao(error);
      setErro(mensagemFalhaTransicao(error, 'chegada'));
      setSalvando(false);
    }
  };

  return (
    <Modal title={`Registrar Retorno da Viagem #${viagem.id}`} onClose={onClose} telaInteira>
      <form onSubmit={handleSubmit}>
        {erro && (
          <Alert tone="danger" className="mb-4">
            {erro}
          </Alert>
        )}

        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px]">
          <div className="font-bold text-slate-900">
            {viagem.origem ?? '—'} → {viagem.destino ?? '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Veículo:{' '}
            <strong>
              {viagem.veiculo_modelo} ({viagem.veiculo_placa})
            </strong>{' '}
            • Motorista: <strong>{viagem.motorista_nome}</strong>
          </div>
          <div className="mt-1 text-xs font-semibold text-primary">
            Odômetro de saída (Km inicial): {kmInicial.toLocaleString('pt-BR')} km
          </div>
        </div>

        <Input
          label="Odômetro Final (Km de Retorno) *"
          type="number"
          inputMode="numeric"
          placeholder={`Maior que ${kmInicial}`}
          value={kmFinal}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmFinal(e.target.value)}
          min={kmInicial}
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

        <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t-0 p-0 md:mt-5 md:flex-row md:gap-3 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
          {foto.enviando ? (
            <Button variant="ghost" type="button" onClick={foto.cancelarEnvio}>
              Cancelar envio
            </Button>
          ) : (
            <Button variant="ghost" type="button" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={salvando || foto.consultando}>
            {foto.enviando ? 'Enviando foto...' : salvando ? 'Concluindo...' : 'Confirmar Chegada e Concluir'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
