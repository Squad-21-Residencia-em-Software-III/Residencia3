import { Component, Suspense, lazy, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { verificarSuporteWebgl } from '../../utils/suporteWebgl';
import type { MapaBaseCanvasProps } from './MapaBaseCanvas';

const MapaBaseCanvasLazy = lazy(() => import('./MapaBaseCanvas'));

export interface MapaBaseProps extends Omit<MapaBaseCanvasProps, 'onErroCarregamento'> {
  fallback?: ReactNode;
  mensagemFallback?: string;
  onIndisponivel?: (motivo: 'webgl' | 'erro') => void;
}

interface LimiteErroProps {
  onErro: () => void;
  fallback: ReactNode;
  children: ReactNode;
}

interface LimiteErroState {
  houveErro: boolean;
}

class LimiteErroMapa extends Component<LimiteErroProps, LimiteErroState> {
  state: LimiteErroState = { houveErro: false };

  static getDerivedStateFromError(): LimiteErroState {
    return { houveErro: true };
  }

  componentDidCatch(_erro: Error, _info: ErrorInfo) {
    this.props.onErro();
  }

  render() {
    if (this.state.houveErro) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function MapaBase({
  fallback,
  mensagemFallback = 'O mapa interativo não pôde ser carregado neste dispositivo. Continue informando o endereço manualmente.',
  onIndisponivel,
  altura = '320px',
  ...propsCanvas
}: MapaBaseProps) {
  const [webglDisponivel, setWebglDisponivel] = useState<boolean>();
  const [erroMapa, setErroMapa] = useState(false);
  const suporteVerificado = useRef(false);
  const motivoComunicado = useRef(false);
  const motivo = webglDisponivel === false ? 'webgl' : erroMapa ? 'erro' : undefined;

  useEffect(() => {
    if (suporteVerificado.current) return;
    suporteVerificado.current = true;
    setWebglDisponivel(verificarSuporteWebgl());
  }, []);

  useEffect(() => {
    if (!motivo || !onIndisponivel || motivoComunicado.current) return;
    motivoComunicado.current = true;
    onIndisponivel(motivo);
  }, [motivo, onIndisponivel]);

  const acionarErro = () => setErroMapa(true);

  const conteudoFallback = fallback ?? (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-700"
      style={{ minHeight: altura }}
    >
      <p className="font-medium text-slate-900">Mapa indisponível no momento</p>
      <p className="max-w-md text-xs text-slate-600">{mensagemFallback}</p>
    </div>
  );

  if (motivo) {
    return <>{conteudoFallback}</>;
  }

  const carregando = (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-600"
      style={{ height: altura }}
    >
      Carregando mapa...
    </div>
  );

  if (webglDisponivel === undefined) return carregando;

  return (
    <LimiteErroMapa onErro={acionarErro} fallback={conteudoFallback}>
      <Suspense fallback={carregando}>
        <MapaBaseCanvasLazy
          {...propsCanvas}
          altura={altura}
          onErroCarregamento={acionarErro}
        />
      </Suspense>
    </LimiteErroMapa>
  );
}
