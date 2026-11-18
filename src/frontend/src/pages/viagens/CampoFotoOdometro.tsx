import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Camera, Maximize2, Minimize2, Trash2, Upload } from 'lucide-react';
import { Alert, Button } from '../../components/ui';
import { LABELS_FASE_ODOMETRO, type FaseOdometro } from '../../types/evidenciaOdometro';
import { DESCRICAO_FORMATOS, TAMANHO_MAXIMO_FOTO_MB, validarFotoOdometro } from '../../utils/fotoOdometro';
import { cn } from '../../utils/cn';

interface CampoFotoOdometroProps {
  fase: FaseOdometro;
  arquivo: File | null;
  onChange: (arquivo: File | null) => void;
  disabled?: boolean;
}

/**
 * Foto do odômetro (SCRUM-205/206/214): "Tirar foto agora" abre a câmera traseira quando o
 * navegador permite; "Carregar foto" abre a galeria ou os arquivos. A prévia fica só na memória
 * da página (URL temporária revogada ao trocar ou fechar), nunca no armazenamento do navegador.
 */
export function CampoFotoOdometro({ fase, arquivo, onChange, disabled = false }: CampoFotoOdometroProps) {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const idAjuda = useId();
  const [erro, setErro] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const rotuloFase = LABELS_FASE_ODOMETRO[fase].toLowerCase();

  useEffect(() => {
    if (!arquivo) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const aoEscolher = async (e: ChangeEvent<HTMLInputElement>) => {
    const escolhido = e.target.files?.[0] ?? null;
    // Permite escolher o mesmo arquivo de novo depois de remover
    e.target.value = '';
    if (!escolhido) return;
    setValidando(true);
    const problema = await validarFotoOdometro(escolhido);
    setValidando(false);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setAmpliada(false);
    onChange(escolhido);
  };

  const bloqueado = disabled || validando;

  return (
    <fieldset className="mb-4 rounded-md border border-slate-200 p-3 md:p-4" aria-describedby={idAjuda}>
      <legend className="px-1 text-[13px] font-semibold text-slate-800">
        Foto do odômetro na {rotuloFase} *
      </legend>
      <p id={idAjuda} className="mb-3 text-xs text-slate-500">
        Fotografe o painel com os números legíveis, sem reflexo. {DESCRICAO_FORMATOS}, até{' '}
        {TAMANHO_MAXIMO_FOTO_MB} MB. Se a câmera não abrir, use "Carregar foto".
      </p>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={`foto-camera-${fase}`}
        onChange={(e) => void aoEscolher(e)}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={`foto-galeria-${fase}`}
        onChange={(e) => void aoEscolher(e)}
      />

      {erro && (
        <Alert tone="danger" className="mb-3">
          {erro}
        </Alert>
      )}

      {previa && arquivo ? (
        <div className="space-y-2">
          <img
            src={previa}
            alt={`Prévia da foto do odômetro na ${rotuloFase}`}
            className={cn(
              'w-full rounded-md border border-slate-200 bg-slate-50 object-contain',
              ampliada ? 'max-h-[70vh]' : 'max-h-56',
            )}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 justify-center"
              onClick={() => setAmpliada((atual) => !atual)}
              aria-pressed={ampliada}
            >
              {ampliada ? <Minimize2 size={14} className="mr-1.5" /> : <Maximize2 size={14} className="mr-1.5" />}
              {ampliada ? 'Reduzir' : 'Ampliar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 justify-center"
              disabled={bloqueado}
              onClick={() => galeria.current?.click()}
            >
              <Upload size={14} className="mr-1.5" /> Trocar foto
            </Button>
            <Button
              type="button"
              variant="danger-outline"
              className="min-h-11 justify-center"
              disabled={bloqueado}
              onClick={() => {
                setErro(null);
                onChange(null);
              }}
            >
              <Trash2 size={14} className="mr-1.5" /> Remover foto
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="min-h-11 justify-center"
            disabled={bloqueado}
            onClick={() => camera.current?.click()}
          >
            <Camera size={15} className="mr-1.5" /> Tirar foto agora
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 justify-center"
            disabled={bloqueado}
            onClick={() => galeria.current?.click()}
          >
            <Upload size={15} className="mr-1.5" /> Carregar foto
          </Button>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {validando ? 'Verificando a foto...' : arquivo ? `Foto selecionada: ${arquivo.name}` : ''}
      </p>
    </fieldset>
  );
}
