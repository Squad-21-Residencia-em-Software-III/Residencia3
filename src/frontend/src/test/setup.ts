
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    default: ({
      children,
      mapStyle,
      onError,
      onLoad,
      onSourceData,
    }: {
      children?: React.ReactNode
      mapStyle?: string
      onError?: (e: unknown) => void
      onLoad?: () => void
      onSourceData?: (e: unknown) => void
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'mock-maplibre',
          'data-map-style': typeof mapStyle === 'string' ? mapStyle : '',
          onClick: (evento: React.MouseEvent) => {
            const acao = (evento.target as HTMLElement).dataset.acao
            if (acao === 'tile') onError?.({ target: {}, tile: {} })
            if (acao === 'fatal') onError?.({ target: null })
            if (acao === 'carregou') {
              onSourceData?.({ source: { type: 'vector' }, tile: {} })
              onLoad?.()
            }
          },
        },
        children,
        React.createElement('button', { 'data-acao': 'tile' }, 'Falhar tile'),
        React.createElement('button', { 'data-acao': 'fatal' }, 'Falhar inicialização'),
        React.createElement('button', { 'data-acao': 'carregou' }, 'Carregar mapa e tile'),
      ),
    Marker: ({
      children,
      latitude,
      longitude,
    }: {
      children?: React.ReactNode
      latitude: number
      longitude: number
    }) =>
      React.createElement(
        'div',
        {
          'data-testid': 'mock-maplibre-marker',
          'data-lat': latitude,
          'data-lng': longitude,
        },
        children,
      ),
    NavigationControl: () => React.createElement('div', { 'data-testid': 'mock-maplibre-nav' }),
    Source: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'mock-maplibre-source' }, children),
    Layer: () => React.createElement('div', { 'data-testid': 'mock-maplibre-layer' }),
  }
})

afterEach(() => {
  cleanup()
})
