import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react');
  return {
    default: ({
      children,
      mapStyle,
      onClick,
      onError,
      onLoad,
      onSourceData,
      ref,
    }: {
      children?: React.ReactNode;
      mapStyle?: string;
      onClick?: (e: { lngLat: { lat: number; lng: number } }) => void;
      onError?: (e: unknown) => void;
      onLoad?: () => void;
      onSourceData?: (e: unknown) => void;
      ref?: React.Ref<unknown>;
    }) => {
      const mapa = React.useMemo(() => {
        const eventos = new EventTarget();
        const estado = { renderiza: false, estiloPronto: false };
        return {
          estado,
          on: eventos.addEventListener.bind(eventos),
          off: eventos.removeEventListener.bind(eventos),
          emitir: (nome: string) => eventos.dispatchEvent(new Event(nome)),
          isStyleLoaded: () => estado.estiloPronto,
          queryRenderedFeatures: () => (estado.renderiza ? [{}] : []),
        };
      }, []);
      React.useImperativeHandle(
        ref,
        () => ({
          getMap: () => mapa,
          flyTo: vi.fn(),
          jumpTo: vi.fn(),
        }),
        [mapa],
      );
      return React.createElement(
        'div',
        {
          'data-testid': 'mock-maplibre',
          'data-map-style': typeof mapStyle === 'string' ? mapStyle : '',
          onClick: (evento: React.MouseEvent) => {
            const acao = (evento.target as HTMLElement).dataset.acao;
            if (acao === 'clicar-mapa') {
              onClick?.({ lngLat: { lat: -10.925, lng: -37.065 } });
              return;
            }
            if (acao === 'tile') onError?.({ target: mapa, tile: {} });
            if (acao === 'tela-vazia') {
              mapa.estado.renderiza = false;
              onError?.({ target: mapa, tile: {} });
            }
            if (acao === 'contexto-perdido') {
              mapa.estado.estiloPronto = false;
              mapa.estado.renderiza = false;
              mapa.emitir('webglcontextlost');
            }
            if (acao === 'contexto-restaurado') mapa.emitir('webglcontextrestored');
            if (acao === 'fatal') onError?.({ target: null });
            if (acao === 'carregou') {
              mapa.estado.estiloPronto = true;
              mapa.estado.renderiza = true;
              mapa.emitir('style.load');
              onSourceData?.({ source: { type: 'vector' }, tile: { hasData: () => true } });
              onLoad?.();
            }
          },
        },
        children,
        React.createElement('button', { type: 'button', 'data-acao': 'tile' }, 'Falhar tile'),
        React.createElement(
          'button',
          { type: 'button', 'data-acao': 'fatal' },
          'Falhar inicialização',
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-acao': 'carregou' },
          'Carregar mapa e tile',
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-acao': 'tela-vazia' },
          'Interromper todos os tiles',
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-acao': 'contexto-perdido' },
          'Perder contexto WebGL',
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-acao': 'contexto-restaurado' },
          'Restaurar contexto WebGL',
        ),
        React.createElement(
          'button',
          { type: 'button', 'data-acao': 'clicar-mapa' },
          'Clicar no mapa',
        ),
      );
    },
    Marker: ({
      children,
      draggable,
      latitude,
      longitude,
      onDragEnd,
    }: {
      children?: React.ReactNode;
      draggable?: boolean;
      latitude: number;
      longitude: number;
      onDragEnd?: (e: { lngLat: { lat: number; lng: number } }) => void;
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'mock-maplibre-marker',
          'data-lat': latitude,
          'data-lng': longitude,
          'data-draggable': draggable ? 'true' : 'false',
        },
        children,
        draggable
          ? React.createElement(
              'button',
              {
                type: 'button',
                'data-testid': 'mock-maplibre-marker-dragend',
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onDragEnd?.({ lngLat: { lat: -10.931, lng: -37.051 } });
                },
              },
              'Finalizar arraste do marcador',
            )
          : null,
      ),
    NavigationControl: () => React.createElement('div', { 'data-testid': 'mock-maplibre-nav' }),
    Source: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'mock-maplibre-source' }, children),
    Layer: () => React.createElement('div', { 'data-testid': 'mock-maplibre-layer' }),
  };
});

afterEach(() => {
  cleanup();
});
