import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button, Input, Modal } from '../../components/ui';
import type { Viagem } from '../../types/viagem';
import { SituacaoFotoOdometro } from './SituacaoFotoOdometro';
import { mensagemFalhaTransicao, useFotoOdometro } from './useFotoOdometro';

interface ModalIniciarViagemProps {
  viagem: Viagem;
  onClose: () => void;
  /** `evidenciaId`: foto da saída já enviada (SCRUM-205), quando `fotosOdometro` está ligado. */
  onSalvar: (kmInicial: number, evidenciaId?: string) => Promise<void>;
}

export function ModalIniciarViagem({ viagem, onClose, onSalvar }: ModalIniciarViagemProps) {
  const [kmInicial, setKmInicial] = useState<string>('');
  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  const foto = useFotoOdometro(viagem, 'SAIDA');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    setErro('');

    const kmInicialNum = Number(kmInicial);
    if (!kmInicial || !Number.isInteger(kmInicialNum) || kmInicialNum < 0) {
      setErro('Informe o odômetro de saída como um número inteiro.');
      return;
    }
    if (foto.fotoExigida && !foto.arquivo) {
      setErro('Tire ou carregue a foto do odômetro na saída.');
      return;
    }

    setSalvando(true);
    try {
      const evidenciaId = await foto.obterEvidenciaId();
      if (evidenciaId) await onSalvar(kmInicialNum, evidenciaId);
      else await onSalvar(kmInicialNum);
      onClose();
    } catch (error) {
      foto.tratarErroTransicao(error);
      setErro(mensagemFalhaTransicao(error, 'saída'));
      setSalvando(false);
    }
  };

  return (
    <Modal title={`Iniciar Viagem #${viagem.id}`} onClose={onClose} telaInteira>
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
        </div>

        <Input
          label="Odômetro de Saída (Km Inicial) *"
          type="number"
          inputMode="numeric"
          placeholder="Ex: 35000"
          value={kmInicial}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKmInicial(e.target.value)}
          min={0}
          required
        />

        <SituacaoFotoOdometro fase="SAIDA" foto={foto} disabled={salvando} />

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
              Voltar
            </Button>
          )}
          <Button type="submit" disabled={salvando || foto.consultando}>
            {foto.enviando ? 'Enviando foto...' : salvando ? 'Iniciando...' : 'Confirmar Saída'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
