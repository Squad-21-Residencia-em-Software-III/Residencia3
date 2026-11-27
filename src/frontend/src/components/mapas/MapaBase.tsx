import { Component, Suspense, lazy, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
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
  const webglDisponivel = useMemo(() => verificarSuporteWebgl(), []);
  const [erroMapa, setErroMapa] = useState(false);

  const acionarErro = () => {
    setErroMapa(true);
    onIndisponivel?.('erro');
  };

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

  if (!webglDisponivel || erroMapa) {
    return <>{conteudoFallback}</>;
  }

  return (
    <LimiteErroMapa onErro={acionarErro} fallback={conteudoFallback}>
      <Suspense
        fallback={
          <div
            role="status"
            aria-live="polite"
            className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-600"
            style={{ height: altura }}
          >
            Carregando mapa...
          </div>
        }
      >
        <MapaBaseCanvasLazy
          {...propsCanvas}
          altura={altura}
          onErroCarregamento={acionarErro}
        />
      </Suspense>
    </LimiteErroMapa>
  );
}
